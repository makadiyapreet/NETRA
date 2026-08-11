/**
 * Scheduled Crawl Manager routes.
 *
 * GET    /api/scheduled-crawls           — List all schedules
 * POST   /api/scheduled-crawls           — Create schedule
 * DELETE /api/scheduled-crawls/:id       — Remove schedule
 * PATCH  /api/scheduled-crawls/:id       — Toggle enabled/disabled
 *
 * Schedules are stored in-memory. Each due schedule triggers the
 * live-fetch pipeline for its configured query/platforms.
 */

import { Router, Request, Response } from 'express';
import { extractRole, requireRole } from '../auth/rbac';
import { auditLogger } from '../middleware/audit-logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
router.use(extractRole);

// ── In-Memory Schedule Store ──────────────────────────────────────────────

interface CrawlSchedule {
  id: string;
  query: string;
  platforms: string[];
  interval_seconds: number;
  enabled: boolean;
  created_at: string;
  created_by: string;
  last_run_at: string | null;
  next_run_at: string;
  run_count: number;
  last_result: { posts_fetched: number; error?: string } | null;
}

const schedules: Map<string, CrawlSchedule> = new Map();
const timers: Map<string, NodeJS.Timeout> = new Map();

function computeNextRun(intervalSeconds: number): string {
  return new Date(Date.now() + intervalSeconds * 1000).toISOString();
}

/**
 * Execute a scheduled crawl by calling the live-fetch logic.
 */
async function executeCrawl(schedule: CrawlSchedule, app: any): Promise<void> {
  const dataStore = app.locals?.dataStore;
  const io = app.locals?.io;
  if (!dataStore) return;

  console.log(`[CrawlScheduler] Executing schedule "${schedule.id}" — query="${schedule.query}", platforms=${schedule.platforms.join(',')}`);

  try {
    // Use the gateway's internal fetch URL
    // The live-fetch pipeline can take 300+ seconds due to NLP classification,
    // so we set a generous 10-minute timeout.
    const gatewayPort = process.env.PORT || 4000;
    const response = await fetch(`http://127.0.0.1:${gatewayPort}/api/live/fetch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-role': 'Admin', // Internal call
      },
      body: JSON.stringify({
        query: schedule.query,
        platforms: schedule.platforms,
        source: 'scheduled-crawl',
      }),
      signal: AbortSignal.timeout(600_000), // 10 minutes
    });

    const result = await response.json() as any;
    const postsFetched = result.total || result.total_fetched || result.posts?.length || 0;

    schedule.last_run_at = new Date().toISOString();
    schedule.run_count += 1;
    schedule.last_result = { posts_fetched: postsFetched };
    schedule.next_run_at = computeNextRun(schedule.interval_seconds);

    console.log(`[CrawlScheduler] Schedule "${schedule.id}" completed — ${postsFetched} posts fetched (run #${schedule.run_count})`);

    // Emit via Socket.IO
    if (io) {
      io.emit('scheduled-crawl-completed', {
        schedule_id: schedule.id,
        query: schedule.query,
        posts_fetched: postsFetched,
        run_count: schedule.run_count,
        completed_at: schedule.last_run_at,
      });
    }
  } catch (err: any) {
    schedule.last_run_at = new Date().toISOString();
    schedule.last_result = { posts_fetched: 0, error: err.message };
    schedule.next_run_at = computeNextRun(schedule.interval_seconds);
    console.error(`[CrawlScheduler] Schedule "${schedule.id}" failed:`, err.message);
  }
}

/**
 * Start the interval timer for a schedule.
 */
function startScheduleTimer(schedule: CrawlSchedule, app: any): void {
  stopScheduleTimer(schedule.id);

  if (!schedule.enabled) return;

  const timer = setInterval(() => {
    const current = schedules.get(schedule.id);
    if (current && current.enabled) {
      executeCrawl(current, app);
    }
  }, schedule.interval_seconds * 1000);

  timers.set(schedule.id, timer);
}

function stopScheduleTimer(id: string): void {
  const existing = timers.get(id);
  if (existing) {
    clearInterval(existing);
    timers.delete(id);
  }
}

// ── Routes ────────────────────────────────────────────────────────────────

/**
 * GET /api/scheduled-crawls
 */
router.get('/', (req: Request, res: Response) => {
  const list = Array.from(schedules.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  res.json({ data: list, total: list.length });
});

/**
 * POST /api/scheduled-crawls
 * Body: { query: string, platforms: string[], interval_seconds: number }
 */
router.post(
  '/',
  requireRole('Admin'),
  auditLogger('create_scheduled_crawl'),
  (req: Request, res: Response) => {
    const { query, platforms, interval_seconds } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'query is required' });
    }
    if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return res.status(400).json({ error: 'platforms array is required (e.g. ["youtube", "telegram"])' });
    }

    const interval = Math.max(60, Number(interval_seconds) || 300); // Min 60 seconds

    const schedule: CrawlSchedule = {
      id: `SCH-${uuidv4().slice(0, 8).toUpperCase()}`,
      query: query.trim(),
      platforms: platforms.map((p: string) => p.toLowerCase()),
      interval_seconds: interval,
      enabled: true,
      created_at: new Date().toISOString(),
      created_by: (req as any).userName || 'Admin',
      last_run_at: null,
      next_run_at: computeNextRun(interval),
      run_count: 0,
      last_result: null,
    };

    schedules.set(schedule.id, schedule);
    startScheduleTimer(schedule, req.app);

    // Execute immediately on creation
    executeCrawl(schedule, req.app);

    res.status(201).json(schedule);
  }
);

/**
 * DELETE /api/scheduled-crawls/:id
 */
router.delete(
  '/:id',
  requireRole('Admin'),
  auditLogger('delete_scheduled_crawl'),
  (req: Request, res: Response) => {
    const { id } = req.params;

    if (!schedules.has(id)) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    stopScheduleTimer(id);
    schedules.delete(id);
    res.json({ success: true, deleted: id });
  }
);

/**
 * PATCH /api/scheduled-crawls/:id
 * Body: { enabled: boolean }
 */
router.patch(
  '/:id',
  requireRole('Admin'),
  auditLogger('toggle_scheduled_crawl'),
  (req: Request, res: Response) => {
    const { id } = req.params;
    const schedule = schedules.get(id);

    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    if (typeof req.body.enabled === 'boolean') {
      schedule.enabled = req.body.enabled;
    }
    if (req.body.query) {
      schedule.query = req.body.query.trim();
    }
    if (req.body.interval_seconds) {
      schedule.interval_seconds = Math.max(60, Number(req.body.interval_seconds));
      schedule.next_run_at = computeNextRun(schedule.interval_seconds);
    }

    // Restart timer with new settings
    startScheduleTimer(schedule, req.app);

    res.json(schedule);
  }
);

export default router;

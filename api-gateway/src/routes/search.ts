/**
 * Unified global search endpoint.
 *
 * GET /api/search?q={keyword}
 *
 * Returns unified results across posts, alerts, trend spikes, and
 * coordination clusters. Logs every search query via audit-logger.
 */

import { Router, Request, Response } from 'express';
import { extractRole } from '../auth/rbac';
import { auditLogger } from '../middleware/audit-logger';
import { DataStore } from '../data-store';
import { getClassifiedPosts, getLiveAlerts, getLiveSpikes } from '../kafka-consumer';

const router = Router();
router.use(extractRole);

/**
 * GET /api/search?q={keyword}
 *
 * Cross-entity search: posts, alerts, trend-spikes, coordination clusters.
 */
router.get('/', auditLogger('search'), async (req: Request, res: Response) => {
  const q = (req.query.q as string || '').trim();

  if (!q) {
    res.status(400).json({ error: 'Query parameter "q" is required' });
    return;
  }

  const mode = process.env.MODE || 'kafka';
  const qLower = q.toLowerCase();

  try {
    // ── 1. Search posts ──────────────────────────────────────────
    let matchingPosts: any[] = [];

    const esClient = req.app.locals.esClient;
    if (esClient?.isConnected()) {
      // Use Elasticsearch full-text search
      const esResult = await esClient.searchClassifiedPosts({
        keyword: q,
        size: 50,
      });
      matchingPosts = esResult.data;
    } else {
      // Fallback to DataStore (fixture mode or ES unavailable)
      const dataStore: DataStore = req.app.locals.dataStore;
      const postResult = dataStore.getPosts({ keyword: q, size: 50 });
      matchingPosts = postResult.data;
    }

    // ── 2. Search alerts ─────────────────────────────────────────
    let relatedAlerts: any[] = [];

    // Get matching post IDs for alert cross-reference
    const matchingPostIds = new Set(matchingPosts.map((p: any) => p.post_id));

    if (mode === 'kafka') {
      // From live Kafka-consumed alerts
      const liveAlerts = getLiveAlerts();
      relatedAlerts = liveAlerts.filter(
        (a: any) =>
          matchingPostIds.has(a.post_id) ||
          a.triggering_reason?.toLowerCase().includes(qLower) ||
          a.threat_category?.toLowerCase().includes(qLower)
      );
    } else {
      // From DataStore (fixture)
      const dataStore: DataStore = req.app.locals.dataStore;
      const allAlerts = dataStore.getAlerts();
      relatedAlerts = allAlerts.filter(
        (a: any) =>
          matchingPostIds.has(a.post_id) ||
          a.title?.toLowerCase().includes(qLower) ||
          a.description?.toLowerCase().includes(qLower)
      );
    }

    // ── 3. Search trend spikes ───────────────────────────────────
    let trendHistory: any[] = [];

    if (mode === 'kafka') {
      const spikes = getLiveSpikes();
      trendHistory = spikes.filter(
        (s: any) => s.keyword?.toLowerCase().includes(qLower)
      );
    } else {
      const dataStore: DataStore = req.app.locals.dataStore;
      const allSpikes = dataStore.getTrendSpikes();
      trendHistory = allSpikes.filter(
        (s: any) => s.keyword?.toLowerCase().includes(qLower)
      );
    }

    // ── 4. Search coordination clusters ──────────────────────────
    let relatedClusters: any[] = [];
    try {
      const networkHost = process.env.NETWORK_SERVICE_HOST || 'localhost';
      const networkPort = process.env.NETWORK_SERVICE_PORT || '8001';
      const networkRes = await fetch(
        `http://${networkHost}:${networkPort}/clusters`
      );
      if (networkRes.ok) {
        const allClusters = (await networkRes.json()) as any[];
        // Check if any matching post author appears in a cluster
        const matchingAuthors = new Set(
          matchingPosts.map((p: any) => p.author_handle?.replace('@', '')).filter(Boolean)
        );
        relatedClusters = Array.isArray(allClusters)
          ? allClusters.filter((c: any) =>
              c.accounts?.some((acc: string) => matchingAuthors.has(acc))
            )
          : [];
      }
    } catch (err) {
      // Network service unavailable — degrade gracefully
      console.warn('Network service unavailable for cluster search:', err);
    }

    // ── 5. Return unified response ───────────────────────────────
    res.json({
      keyword: q,
      matching_posts: matchingPosts.slice(0, 50),
      related_alerts: relatedAlerts.slice(0, 20),
      trend_history: trendHistory.slice(0, 20),
      related_clusters: relatedClusters.slice(0, 10),
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Search failed', details: String(err) });
  }
});

export default router;

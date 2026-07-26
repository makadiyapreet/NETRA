import { Router, Request, Response } from 'express';
import { extractRole, requireRole } from '../auth/rbac';
import { auditLogger } from '../middleware/audit-logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
router.use(extractRole);

/**
 * POST /api/reports/generate
 * Generates a mock incident report. In demo mode, returns a pre-built JSON summary.
 * Body: { post_ids: string[], format?: "pdf" | "docx" | "json" }
 */
router.post(
  '/generate',
  requireRole('Admin'),
  auditLogger('generate_report'),
  (req: Request, res: Response) => {
    const dataStore = req.app.locals.dataStore;
    const { post_ids = [], format = 'json' } = req.body;

    if (!post_ids.length) {
      return res.status(400).json({ error: 'post_ids array is required' });
    }

    const posts = dataStore.getPostsByIds(post_ids);

    if (!posts.length) {
      return res.status(404).json({ error: 'No posts found for the given IDs' });
    }

    // Build report summary
    const report = {
      report_id: `RPT-${uuidv4().slice(0, 8).toUpperCase()}`,
      generated_at: new Date().toISOString(),
      generated_by: (req as any).userName,
      format,
      summary: {
        total_posts: posts.length,
        threat_breakdown: posts.reduce((acc: Record<string, number>, p: any) => {
          const cat = p.classification.threat_category;
          acc[cat] = (acc[cat] || 0) + 1;
          return acc;
        }, {}),
        languages: [...new Set(posts.map((p: any) => p.detected_language))],
        platforms: [...new Set(posts.map((p: any) => p.platform))],
        date_range: {
          from: posts.map((p: any) => p.timestamp).sort()[0],
          to: posts.map((p: any) => p.timestamp).sort().reverse()[0]
        },
        avg_confidence: +(posts.reduce((s: number, p: any) => s + p.classification.confidence, 0) / posts.length).toFixed(3),
        total_engagement: posts.reduce((s: number, p: any) => s + p.engagement_counts.likes + p.engagement_counts.shares + p.engagement_counts.comments, 0)
      },
      posts: posts.map((p: any) => ({
        post_id: p.post_id,
        platform: p.platform,
        author: p.author_handle,
        threat_category: p.classification.threat_category,
        confidence: p.classification.confidence,
        text_preview: p.text.slice(0, 120) + (p.text.length > 120 ? '...' : ''),
        full_text: p.text,
        geo: p.geo_location?.city || 'Unknown',
        post_url: p.post_url
      })),
      recommendations: [
        'Escalate high-confidence incitement posts to law enforcement.',
        'Issue counter-narrative advisory for fake news trends.',
        'Monitor identified bot clusters for further coordinated activity.',
        'Flag author accounts for platform-level review.'
      ]
    };

    res.json(report);
  }
);

export default router;

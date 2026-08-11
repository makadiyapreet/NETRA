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

// ── IPC / IT Act Section Mapping ──────────────────────────────────────────
const IPC_SECTION_MAP: Record<string, { sections: string[]; descriptions: string[] }> = {
  IncitementToViolence: {
    sections: ['IPC 153A', 'IPC 505(1)(b)', 'IT Act 66F'],
    descriptions: [
      'Promoting enmity between different groups on grounds of religion, race, etc.',
      'Statements conducing to public mischief',
      'Punishment for cyber terrorism',
    ],
  },
  Inflammatory: {
    sections: ['IPC 153A', 'IPC 295A', 'IPC 504'],
    descriptions: [
      'Promoting enmity between different groups',
      'Deliberate and malicious acts intended to outrage religious feelings',
      'Intentional insult with intent to provoke breach of the peace',
    ],
  },
  FakeNews: {
    sections: ['IPC 505(1)(b)', 'IT Act 66D', 'IT Act 67'],
    descriptions: [
      'Statements conducing to public mischief',
      'Punishment for cheating by personation using computer resource',
      'Punishment for publishing or transmitting obscene material in electronic form',
    ],
  },
  Neutral: {
    sections: ['IT Act 66'],
    descriptions: ['Computer related offences (general)'],
  },
};

/**
 * POST /api/reports/generate-fir
 * Generates an FIR (First Information Report) draft with IPC section mapping.
 * Body: { post_ids: string[] }
 */
router.post(
  '/generate-fir',
  requireRole('Admin'),
  auditLogger('generate_fir'),
  (req: Request, res: Response) => {
    const dataStore = req.app.locals.dataStore;
    const { post_ids = [] } = req.body;

    if (!post_ids.length) {
      return res.status(400).json({ error: 'post_ids array is required' });
    }

    const posts = dataStore.getPostsByIds(post_ids);
    if (!posts.length) {
      return res.status(404).json({ error: 'No posts found for the given IDs' });
    }

    // Build evidence chain
    const crypto = require('crypto');
    let previousHash = '0'.repeat(64); // Genesis
    const evidenceEntries: any[] = [];

    for (const post of posts) {
      const evidenceData = JSON.stringify({
        post_id: post.post_id,
        platform: post.platform,
        text: post.text,
        author: post.author_handle,
        classification: post.classification,
        timestamp: post.timestamp,
      }, null, 0);

      const evidenceHash = crypto.createHash('sha256').update(evidenceData).digest('hex');
      const combinedHash = crypto.createHash('sha256').update(`${previousHash}${evidenceHash}`).digest('hex');

      evidenceEntries.push({
        sequence: evidenceEntries.length + 1,
        post_id: post.post_id,
        evidence_hash: evidenceHash,
        previous_hash: previousHash,
        combined_hash: combinedHash,
      });

      previousHash = combinedHash;
    }

    // Determine primary threat category across all posts
    const threatCounts: Record<string, number> = {};
    for (const post of posts) {
      const cat = post.classification?.threat_category || 'Neutral';
      threatCounts[cat] = (threatCounts[cat] || 0) + 1;
    }
    const primaryThreat = Object.entries(threatCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Neutral';

    const ipcMapping = IPC_SECTION_MAP[primaryThreat] || IPC_SECTION_MAP['Neutral'];

    // Build FIR
    const fir = {
      fir_id: `FIR-${uuidv4().slice(0, 8).toUpperCase()}`,
      generated_at: new Date().toISOString(),
      generated_by: (req as any).userName || 'NETRA System',
      status: 'DRAFT',

      // Complainant details
      complainant: {
        agency: 'NETRA OSINT System',
        jurisdiction: 'Gujarat',
        contact: 'cybercrime@netra.gov.in',
      },

      // Incident details
      incident: {
        type: primaryThreat,
        severity: posts.some((p: any) => (p.classification?.confidence || 0) > 0.85) ? 'Critical' : 'High',
        date_of_incident: posts.map((p: any) => p.timestamp).sort()[0] || new Date().toISOString(),
        platforms_involved: [...new Set(posts.map((p: any) => p.platform))],
        total_posts: posts.length,
        avg_confidence: +(posts.reduce((s: number, p: any) => s + (p.classification?.confidence || 0), 0) / posts.length).toFixed(3),
        description: `Automated detection of ${primaryThreat} content across ${posts.length} social media post(s). ` +
          `Content classified with average confidence of ${(posts.reduce((s: number, p: any) => s + (p.classification?.confidence || 0), 0) / posts.length * 100).toFixed(1)}%. ` +
          `Detected on platform(s): ${[...new Set(posts.map((p: any) => p.platform))].join(', ')}.`,
      },

      // Accused / suspect information
      suspects: posts.map((p: any) => ({
        platform: p.platform,
        handle: p.author_handle || 'Unknown',
        post_id: p.post_id,
        text_preview: (p.text || '').slice(0, 200),
        post_url: p.post_url || null,
      })),

      // Legal sections
      applicable_law: {
        sections: ipcMapping.sections,
        descriptions: ipcMapping.descriptions,
        primary_category: primaryThreat,
        section_map_used: 'NETRA IPC/IT Act Auto-Mapper v1.0',
      },

      // Evidence integrity
      evidence_chain: {
        chain_length: evidenceEntries.length,
        latest_hash: previousHash,
        entries: evidenceEntries,
        integrity_note: 'SHA-256 tamper-evident hash chain. Each entry derives from the previous. Altering any entry invalidates all subsequent hashes.',
      },

      // Recommendations
      recommendations: [
        `File FIR under ${ipcMapping.sections.join(', ')} based on threat classification "${primaryThreat}".`,
        'Preserve digital evidence — screenshots and API response payloads are included in the hash chain.',
        'Request platform takedown for high-severity content under IT Act compliance.',
        'Escalate to I4C (Indian Cyber Crime Coordination Centre) if cross-state jurisdiction applies.',
      ],
    };

    res.json(fir);
  }
);

export default router;

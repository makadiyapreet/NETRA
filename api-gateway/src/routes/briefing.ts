/**
 * Daily briefing API route.
 * GET /api/briefing/today — returns today's AI-generated executive summary.
 */

import { Router, Request, Response } from 'express';

const router = Router();

router.get('/today', async (req: Request, res: Response) => {
  try {
    // Try to fetch from NLP engine's briefing endpoint
    const nlpUrl = process.env.NLP_SERVICE_URL || 'http://localhost:8000';
    
    try {
      const response = await fetch(`${nlpUrl}/briefing/today`);
      if (response.ok) {
        const data = await response.json();
        res.json(data);
        return;
      }
    } catch {
      // NLP service not available, generate from local data
    }

    // Fallback: generate briefing from local alert data
    const dataStore = req.app.locals.dataStore;
    const alerts = dataStore?.getAlerts?.() || [];
    
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { 
      day: 'numeric', month: 'long', year: 'numeric' 
    });

    // Count by category
    const categories: Record<string, number> = {};
    let highSev = 0;
    for (const alert of alerts) {
      const cat = alert.threat_category || alert.category || 'Unknown';
      categories[cat] = (categories[cat] || 0) + 1;
      if ((alert.severity || 0) >= 4) highSev++;
    }

    const categoryLines = Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => `  • ${cat}: ${count} alert${count !== 1 ? 's' : ''}`)
      .join('\n');

    const allPosts = dataStore?.getPosts?.({ size: 1 }) || { total: 0 };
    const totalPostsProcessed = allPosts.total;

    const briefing = `NETRA Daily Threat Briefing — ${dateStr}\n\n` +
      `In the past 24 hours, NETRA processed ${totalPostsProcessed} social media posts across active platforms. ` +
      `${alerts.length} threat alerts were generated, with ${highSev} classified as high-severity (SEV ≥ 4).\n\n` +
      `Threat category breakdown:\n${categoryLines || '  • No alerts generated yet.'}\n\n` +
      (highSev >= 1 
        ? '⚡ RECOMMENDATION: High-severity threat(s) detected. Review and acknowledge within 1 hour.'
        : '✅ RECOMMENDATION: Threat levels within normal parameters. Continue routine monitoring.');

    res.json({
      date: dateStr,
      briefing,
      alert_count: alerts.length,
      high_severity_count: highSev,
      categories,
      generated_at: now.toISOString(),
    });
  } catch (err) {
    console.error('Briefing generation error:', err);
    res.status(500).json({ error: 'Failed to generate briefing' });
  }
});

export default router;

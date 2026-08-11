/**
 * AI-generated incident summary routes.
 *
 * POST /api/ai/generate-summary  — Generate police-briefing-style summary from post IDs
 *
 * Uses Groq API (fast inference) to generate 3-sentence summaries
 * for law enforcement rapid response.
 */

import { Router, Request, Response } from 'express';
import { extractRole } from '../auth/rbac';
import { auditLogger } from '../middleware/audit-logger';

const router = Router();
router.use(extractRole);

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * POST /api/ai/generate-summary
 * Body: { post_ids: string[], context?: string }
 *
 * Generates a 3-sentence police-briefing-style summary using Groq LLM.
 */
router.post(
  '/generate-summary',
  auditLogger('generate_ai_summary'),
  async (req: Request, res: Response) => {
    const dataStore = req.app.locals.dataStore;
    const { post_ids = [], context = '' } = req.body;

    if (!post_ids.length) {
      return res.status(400).json({ error: 'post_ids array is required' });
    }

    const posts = dataStore.getPostsByIds(post_ids);
    if (!posts.length) {
      return res.status(404).json({ error: 'No posts found for the given IDs' });
    }

    // Build context from real post data
    const postSummaries = posts.map((p: any, i: number) => {
      const cat = p.classification?.threat_category || 'Unknown';
      const conf = p.classification?.confidence || 0;
      const text = (p.text || '').slice(0, 300);
      const platform = p.platform || 'Unknown';
      const author = p.author_handle || 'Unknown';
      const timestamp = p.timestamp || 'Unknown';
      return `Post ${i + 1} [${platform}] by @${author} at ${timestamp}:\n` +
        `  Classification: ${cat} (${(conf * 100).toFixed(0)}% confidence)\n` +
        `  Content: "${text}"`;
    }).join('\n\n');

    const systemPrompt = `You are a senior police intelligence analyst preparing a rapid-response incident briefing for a law enforcement command center. Your summaries must be:
- Factual and based ONLY on the provided post data
- Written in 3 concise sentences maximum
- Actionable — highlight the threat type, severity, and recommended immediate action
- Professional — suitable for a police briefing document

Format: A single paragraph of exactly 3 sentences. No bullet points, no headers.`;

    const userPrompt = `Generate a 3-sentence incident summary for rapid law enforcement response based on these flagged social media posts:\n\n${postSummaries}${context ? `\n\nAdditional context: ${context}` : ''}`;

    const groqApiKey = process.env.GROQ_API_KEY;

    if (!groqApiKey || groqApiKey === 'your_key_here') {
      // Fallback: generate a structured summary without LLM
      const categories = [...new Set(posts.map((p: any) => p.classification?.threat_category || 'Unknown'))];
      const platforms = [...new Set(posts.map((p: any) => p.platform))];
      const avgConf = posts.reduce((s: number, p: any) => s + (p.classification?.confidence || 0), 0) / posts.length;

      const fallbackSummary = `NETRA has flagged ${posts.length} post(s) across ${platforms.join(', ')} classified as ${categories.join(', ')} with an average confidence of ${(avgConf * 100).toFixed(0)}%. ` +
        `The content involves ${categories.includes('IncitementToViolence') ? 'direct calls for violence requiring immediate attention' :
          categories.includes('FakeNews') ? 'misinformation that may cause public panic' :
          categories.includes('Inflammatory') ? 'inflammatory rhetoric targeting specific communities' :
          'content under monitoring'}. ` +
        `Recommended action: ${avgConf > 0.85 ? 'Immediate escalation to duty officer and platform takedown request' : 'Review and classify priority level within current shift'}.`;

      return res.json({
        summary: fallbackSummary,
        generated_at: new Date().toISOString(),
        source_posts: posts.length,
        model: 'fallback-template',
        note: 'Generated without LLM — configure GROQ_API_KEY for AI-powered summaries',
      });
    }

    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 300,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`Groq API error: ${response.status} - ${errText}`);
        return res.status(502).json({
          error: 'LLM service unavailable',
          detail: `Groq returned ${response.status}`,
        });
      }

      const data = await response.json() as any;
      const summary = data.choices?.[0]?.message?.content?.trim() || 'Summary generation failed';
      const model = data.model || 'groq-llama-3.1-8b';

      res.json({
        summary,
        generated_at: new Date().toISOString(),
        source_posts: posts.length,
        model,
        tokens_used: data.usage?.total_tokens || 0,
      });
    } catch (err: any) {
      console.error('AI summary generation error:', err);
      res.status(500).json({
        error: 'Failed to generate AI summary',
        detail: err.message,
      });
    }
  }
);

export default router;

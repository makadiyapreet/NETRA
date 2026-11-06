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
    const { post_ids = [], context = '', custom_prompt, system_prompt, user_prompt } = req.body;

    // ── Help Chat Mode: Direct LLM Q&A ──
    if (custom_prompt && system_prompt && user_prompt) {
      const helpKeys = [process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_2].filter(k => k && k !== 'your_key_here') as string[];
      if (!helpKeys.length) {
        return res.json({ summary: 'Help assistant requires GROQ_API_KEY to be configured.', model: 'none' });
      }
      // Try each key
      for (const key of helpKeys) {
        try {
          const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'qwen/qwen3.8-27b',
              messages: [
                { role: 'system', content: system_prompt },
                { role: 'user', content: user_prompt },
              ],
              temperature: 0.3,
              max_tokens: 500,
            }),
          });
          if (response.ok) {
            const data = await response.json() as any;
            const answer = data.choices?.[0]?.message?.content?.trim() || '';
            return res.json({ summary: answer, model: data.model || 'groq-qwen3.8', generated_at: new Date().toISOString() });
          }
          if (response.status === 429) continue; // Try next key
          break; // Other error — don't retry
        } catch {
          continue; // Network error — try next key
        }
      }
      return res.json({ summary: 'I am temporarily unavailable due to API limits. Please try one of the suggested questions — I have built-in answers for those!', model: 'fallback' });
    }

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

    const groqApiKeys = [process.env.GROQ_API_KEY, process.env.GROQ_API_KEY_2].filter(k => k && k !== 'your_key_here') as string[];
    const groqApiKey = groqApiKeys[0];

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
          model: 'qwen/qwen3.8-27b',
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
        // Fallback to template summary instead of returning error
        const categories = [...new Set(posts.map((p: any) => p.classification?.threat_category || 'Unknown'))];
        const platforms = [...new Set(posts.map((p: any) => p.platform))];
        const avgConf = posts.reduce((s: number, p: any) => s + (p.classification?.confidence || 0), 0) / posts.length;
        const topText = (posts[0]?.text || '').slice(0, 150);

        const fallbackSummary = `NETRA Intelligence Alert: ${posts.length} flagged post(s) detected across ${platforms.join(', ')} platforms, classified as ${categories.join(', ')} with average confidence of ${(avgConf * 100).toFixed(0)}%. ` +
          `Primary content involves ${categories.includes('IncitementToViolence') ? 'explicit calls for violence requiring immediate law enforcement attention' :
            categories.includes('FakeNews') ? 'unverified claims and potential misinformation designed to cause public alarm' :
            categories.includes('Inflammatory') ? 'inflammatory rhetoric targeting specific communities that may escalate tensions' :
            'content under active monitoring'} — sample excerpt: "${topText}...". ` +
          `Recommended action: ${avgConf > 0.8 ? 'Immediate escalation to duty officer with platform takedown request and evidence preservation' : 'Review within current shift, classify priority level, and prepare preliminary incident report for supervisor review'}.`;

        return res.json({
          summary: fallbackSummary,
          generated_at: new Date().toISOString(),
          source_posts: posts.length,
          model: 'netra-template-engine',
          note: 'Generated using NETRA template engine (LLM quota temporarily exceeded)',
        });
      }

      const data = await response.json() as any;
      const summary = data.choices?.[0]?.message?.content?.trim() || 'Summary generation failed';
      const model = data.model || 'groq-qwen3.8';

      res.json({
        summary,
        generated_at: new Date().toISOString(),
        source_posts: posts.length,
        model,
        tokens_used: data.usage?.total_tokens || 0,
      });
    } catch (err: any) {
      console.error('AI summary generation error:', err);
      // Also fallback on network errors
      const categories = [...new Set(posts.map((p: any) => p.classification?.threat_category || 'Unknown'))];
      const platforms = [...new Set(posts.map((p: any) => p.platform))];
      const avgConf = posts.reduce((s: number, p: any) => s + (p.classification?.confidence || 0), 0) / posts.length;

      const fallbackSummary = `NETRA has identified ${posts.length} post(s) across ${platforms.join(', ')} classified as ${categories.join(', ')} with ${(avgConf * 100).toFixed(0)}% average confidence. ` +
        `The flagged content ${categories.includes('IncitementToViolence') ? 'contains direct calls for physical violence requiring urgent attention' :
          categories.includes('FakeNews') ? 'involves potential misinformation that may cause public panic' :
          categories.includes('Inflammatory') ? 'features inflammatory rhetoric targeting communities' :
          'is under monitoring'}. ` +
        `Recommended: ${avgConf > 0.85 ? 'Immediate escalation to duty officer and platform takedown request' : 'Review and classify priority within current shift'}.`;

      res.json({
        summary: fallbackSummary,
        generated_at: new Date().toISOString(),
        source_posts: posts.length,
        model: 'netra-template-engine',
      });
    }
  }
);

export default router;

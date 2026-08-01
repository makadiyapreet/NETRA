/**
 * Watchlist management routes.
 *
 * Proxies to the ingestion layer's watchlist API (FastAPI on port 8002).
 * GET    /api/watchlist       — list all entries (Analyst + Admin)
 * POST   /api/watchlist       — add entry (Admin only)
 * PUT    /api/watchlist/:id   — edit entry (Admin only)
 * DELETE /api/watchlist/:id   — soft-delete entry (Admin only)
 */

import { Router, Request, Response } from 'express';
import { extractRole, requireRole } from '../auth/rbac';
import { auditLogger } from '../middleware/audit-logger';

const router = Router();
router.use(extractRole);

const WATCHLIST_API_BASE = `http://${process.env.WATCHLIST_API_HOST || 'localhost'}:${process.env.WATCHLIST_API_PORT || '8002'}`;

// ── NOTE: FIXTURE_WATCHLIST has been intentionally removed. ────────
// The API gateway NEVER returns fake/fixture watchlist data.
// If the upstream watchlist API (port 8002) is down, we return a
// clear 503 error so the frontend can show an honest "offline" state.

/**
 * GET /api/watchlist/matches/:keyword
 * Smart search: matches by text, keywords, threat category, synonyms, geo area.
 */
router.get('/matches/:keyword', (req: Request, res: Response) => {
  const dataStore = req.app.locals.dataStore;
  const rawKeyword = decodeURIComponent(req.params.keyword);
  const keyword = rawKeyword.toLowerCase();

  // Synonym/translation map: watchlist keyword -> related search terms + threat categories
  const KEYWORD_EXPANSIONS: Record<string, { terms: string[]; categories: string[] }> = {
    'communal violence': { terms: ['communal', 'violence', 'riot', 'attack', 'destroy', 'clash', 'lesson', 'target'], categories: ['IncitementToViolence', 'Inflammatory'] },
    'दंगा': { terms: ['दंगा', 'riot', 'हिंसा', 'हथियार', 'मारो', 'attack', 'सड़कों पर', 'इकट्ठा', 'न्याय'], categories: ['IncitementToViolence'] },
    'हिंसा भड़काने': { terms: ['हिंसा', 'भड़काने', 'violence', 'incite', 'हथियार', 'target', 'बर्बाद', 'attack', 'lesson'], categories: ['IncitementToViolence'] },
    'fake news spread': { terms: ['fake', 'news', 'hoax', 'false', 'misleading', 'secretly', 'media silent', 'viral', 'share before delete', 'forwarded'], categories: ['FakeNews'] },
    'riot planning': { terms: ['riot', 'plan', 'target list', 'operations', 'gather', 'mobilize', 'हथियार', 'तैयार', 'location', 'tomorrow'], categories: ['IncitementToViolence'] },
    'bomb threat': { terms: ['bomb', 'blast', 'explosive', 'threat', 'target', 'attack', 'operations'], categories: ['IncitementToViolence'] },
    'ethnic cleansing': { terms: ['cleansing', 'ethnic', 'exterminate', 'remove', 'बहार काढो', 'बहार काढो', 'dangerous'], categories: ['IncitementToViolence', 'Inflammatory'] },
    'સાંપ્રદાયિક': { terms: ['સાંપ્રદાયિક', 'communal', 'ગામ', 'community', 'dangerous', 'બરબાદ', 'સબક'], categories: ['IncitementToViolence', 'Inflammatory'] },
    'hate': { terms: ['hate', 'enemy', 'destroy', 'dangerous', 'trust', 'minority', 'lesson'], categories: ['Inflammatory', 'IncitementToViolence'] },
  };

  // Search across ALL posts in the data store
  const allPosts = dataStore.getPosts({ size: 10000 });

  // Get expansion if available
  const expansion = KEYWORD_EXPANSIONS[keyword] || KEYWORD_EXPANSIONS[rawKeyword];
  const searchTerms = expansion ? expansion.terms : [keyword];
  const matchCategories = expansion ? expansion.categories : [];

  // Helper: create a word-boundary-aware match function.
  // For ASCII/Latin terms, use \b word boundary so "rain" doesn't match "Brain" or "train".
  // For non-Latin scripts (Hindi, Gujarati, etc.), use simple includes() since \b doesn't work with Unicode.
  function makeWordMatcher(term: string): (text: string) => boolean {
    const isAscii = /^[\x00-\x7F]+$/.test(term);
    if (isAscii && term.length >= 2) {
      try {
        const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        return (text: string) => re.test(text);
      } catch {
        return (text: string) => text.toLowerCase().includes(term.toLowerCase());
      }
    }
    // Non-ASCII or very short terms: fall back to includes
    return (text: string) => text.toLowerCase().includes(term.toLowerCase());
  }

  const matches = allPosts.data.filter((post: any) => {
    const text = (post.text || '');
    const textLower = text.toLowerCase();
    const classKeywords = (post.classification?.keywords || []).map((k: string) => k.toLowerCase());
    const handle = (post.author_handle || '').toLowerCase();
    const category = post.classification?.threat_category || '';
    const city = (post.geo_location?.city || '').toLowerCase();

    // Match by threat category
    if (matchCategories.includes(category)) return true;

    // Match by any search term — using word-boundary matching for accuracy
    for (const term of searchTerms) {
      const matcher = makeWordMatcher(term);
      if (matcher(text)) return true;
      if (classKeywords.some((k: string) => k.includes(term.toLowerCase()))) return true;
      if (matcher(handle)) return true;
    }

    // Direct keyword match (for non-expanded terms)
    const kwMatcher = makeWordMatcher(keyword);
    if (kwMatcher(text)) return true;
    if (classKeywords.some((k: string) => k.includes(keyword))) return true;
    if (city.includes(keyword)) return true;

    return false;
  });

  // Sort by confidence (most confident first)
  matches.sort((a: any, b: any) => (b.classification?.confidence || 0) - (a.classification?.confidence || 0));

  res.json({
    keyword: rawKeyword,
    total: matches.length,
    posts: matches.slice(0, 50),
  });
});

/**
 * GET /api/watchlist?type=keyword|hashtag|geo_box|profile&search=...
 * Proxies to upstream watchlist API. Returns 503 if upstream is down — NEVER returns fixture data.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const params = new URLSearchParams();
    if (req.query.type) params.set('type', req.query.type as string);
    if (req.query.search) params.set('search', req.query.search as string);

    const upstream = await fetch(`${WATCHLIST_API_BASE}/watchlist?${params}`);
    if (!upstream.ok) {
      throw new Error(`Upstream returned ${upstream.status}: ${upstream.statusText}`);
    }
    const data = await upstream.json();
    // Return upstream data as-is — even if empty (empty is honest; fixture is not)
    res.json(data);
  } catch (err) {
    console.error('Watchlist API proxy error (GET):', err);
    console.warn('[WATCHLIST] Upstream watchlist API unreachable at', WATCHLIST_API_BASE);
    res.status(503).json({
      error: 'watchlist_service_unavailable',
      message: `The watchlist API (port 8002) is not running. Start it with: python -m uvicorn ingestion.api.watchlist_api:app --port 8002`,
      detail: String(err),
    });
  }
});


/**
 * POST /api/watchlist — Add a new watchlist entry.
 * Body: { type: 'keyword'|'hashtag'|'geo_box'|'profile', ...fields }
 * Admin only.
 */
router.post(
  '/',
  requireRole('Admin'),
  auditLogger('watchlist-add'),
  async (req: Request, res: Response) => {
    try {
      const upstream = await fetch(`${WATCHLIST_API_BASE}/watchlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err) {
      console.error('Watchlist API proxy error (POST):', err);
      res.status(502).json({ error: 'Watchlist service unavailable' });
    }
  }
);

/**
 * PUT /api/watchlist/:id — Edit a watchlist entry.
 * Admin only.
 */
router.put(
  '/:id',
  requireRole('Admin'),
  auditLogger('watchlist-edit'),
  async (req: Request, res: Response) => {
    try {
      const upstream = await fetch(`${WATCHLIST_API_BASE}/watchlist/${req.params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err) {
      console.error('Watchlist API proxy error (PUT):', err);
      res.status(502).json({ error: 'Watchlist service unavailable' });
    }
  }
);

/**
 * DELETE /api/watchlist/:id — Soft-delete a watchlist entry.
 * Admin only.
 */
router.delete(
  '/:id',
  requireRole('Admin'),
  auditLogger('watchlist-delete'),
  async (req: Request, res: Response) => {
    try {
      const upstream = await fetch(`${WATCHLIST_API_BASE}/watchlist/${req.params.id}`, {
        method: 'DELETE',
      });
      const data = await upstream.json();
      res.status(upstream.status).json(data);
    } catch (err) {
      console.error('Watchlist API proxy error (DELETE):', err);
      res.status(502).json({ error: 'Watchlist service unavailable' });
    }
  }
);

export default router;

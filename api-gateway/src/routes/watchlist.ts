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

// ── Fixture Watchlist Data ──────────────────────────────────────
export const FIXTURE_WATCHLIST = {
  keywords: [
    { id: 1, keyword: 'दंगा', platform_filter: null, geo_area: 'Gujarat', is_active: true },
    { id: 2, keyword: 'communal violence', platform_filter: 'twitter', geo_area: null, is_active: true },
    { id: 3, keyword: 'हिंसा भड़काने', platform_filter: null, geo_area: 'Maharashtra', is_active: true },
    { id: 4, keyword: 'fake news spread', platform_filter: 'telegram', geo_area: null, is_active: true },
    { id: 5, keyword: 'riot planning', platform_filter: 'twitter', geo_area: 'Delhi', is_active: true },
    { id: 6, keyword: 'bomb threat', platform_filter: null, geo_area: null, is_active: true },
    { id: 7, keyword: 'ethnic cleansing', platform_filter: 'facebook', geo_area: null, is_active: false },
    { id: 8, keyword: 'સાંપ્રદાયિક', platform_filter: null, geo_area: 'Gujarat', is_active: true },
  ],
  hashtags: [
    { id: 101, hashtag: '#StopHate', platform_filter: 'twitter', geo_area: null, is_active: true },
    { id: 102, hashtag: '#FakeAlert', platform_filter: null, geo_area: 'India', is_active: true },
    { id: 103, hashtag: '#UrbanNaxal', platform_filter: 'twitter', geo_area: null, is_active: true },
    { id: 104, hashtag: '#BreakingIndia', platform_filter: null, geo_area: null, is_active: true },
    { id: 105, hashtag: '#PropagandaWatch', platform_filter: 'telegram', geo_area: null, is_active: true },
    { id: 106, hashtag: '#HateSpeech', platform_filter: 'youtube', geo_area: null, is_active: false },
  ],
  geo_boxes: [
    { id: 201, name: 'Ahmedabad Old City', lat_min: 23.00, lat_max: 23.05, lng_min: 72.55, lng_max: 72.62, is_active: true },
    { id: 202, name: 'Mumbai Dharavi Area', lat_min: 19.04, lat_max: 19.06, lng_min: 72.85, lng_max: 72.87, is_active: true },
    { id: 203, name: 'Delhi Shaheen Bagh', lat_min: 28.54, lat_max: 28.56, lng_min: 77.28, lng_max: 77.31, is_active: true },
    { id: 204, name: 'Vadodara Industrial', lat_min: 22.28, lat_max: 22.32, lng_min: 73.16, lng_max: 73.22, is_active: true },
  ],
  profiles: [
    { id: 301, handle: 'shadow_ops_gj', platform: 'telegram', profile_id: 'TG-90001', is_active: true },
    { id: 302, handle: 'truth_warrior_99', platform: 'twitter', profile_id: 'TW-80002', is_active: true },
    { id: 303, handle: 'news_faker_bot', platform: 'twitter', profile_id: 'TW-80003', is_active: true },
    { id: 304, handle: 'hate_amplifier_7', platform: 'youtube', profile_id: 'YT-70004', is_active: false },
    { id: 305, handle: 'communal_troll_12', platform: 'facebook', profile_id: 'FB-60005', is_active: true },
  ],
};

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
    'ethnic cleansing': { terms: ['cleansing', 'ethnic', 'exterminate', 'remove', 'बहार काढो', 'बहार काढો', 'dangerous'], categories: ['IncitementToViolence', 'Inflammatory'] },
    'સાંપ્રદાયિક': { terms: ['સાંપ્રદાયિક', 'communal', 'ગામ', 'community', 'dangerous', 'બરબાદ', 'સબક'], categories: ['IncitementToViolence', 'Inflammatory'] },
    'hate': { terms: ['hate', 'enemy', 'destroy', 'dangerous', 'trust', 'minority', 'lesson'], categories: ['Inflammatory', 'IncitementToViolence'] },
  };

  // Search across all posts
  const allPosts = dataStore.getPosts({ size: 1000 });

  // Get expansion if available
  const expansion = KEYWORD_EXPANSIONS[keyword] || KEYWORD_EXPANSIONS[rawKeyword];
  const searchTerms = expansion ? expansion.terms : [keyword];
  const matchCategories = expansion ? expansion.categories : [];

  const matches = allPosts.data.filter((post: any) => {
    const text = (post.text || '').toLowerCase();
    const classKeywords = (post.classification?.keywords || []).map((k: string) => k.toLowerCase());
    const handle = (post.author_handle || '').toLowerCase();
    const category = post.classification?.threat_category || '';
    const city = (post.geo_location?.city || '').toLowerCase();

    // Match by threat category
    if (matchCategories.includes(category)) return true;

    // Match by any search term in text, keywords, or handle
    for (const term of searchTerms) {
      const t = term.toLowerCase();
      if (text.includes(t)) return true;
      if (classKeywords.some((k: string) => k.includes(t))) return true;
      if (handle.includes(t)) return true;
    }

    // Direct keyword match (for non-expanded terms)
    if (text.includes(keyword)) return true;
    if (classKeywords.some((k: string) => k.includes(keyword))) return true;
    if (city.includes(keyword)) return true;

    return false;
  });

  // Sort by confidence (most confident first)
  matches.sort((a: any, b: any) => (b.classification?.confidence || 0) - (a.classification?.confidence || 0));

  res.json({
    keyword: rawKeyword,
    total: matches.length,
    posts: matches.slice(0, 20),
  });
});

/**
 * GET /api/watchlist?type=keyword|hashtag|geo_box|profile&search=...
 * List all watchlist entries, optionally filtered by type and search string.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const params = new URLSearchParams();
    if (req.query.type) params.set('type', req.query.type as string);
    if (req.query.search) params.set('search', req.query.search as string);

    const upstream = await fetch(`${WATCHLIST_API_BASE}/watchlist?${params}`);
    if (upstream.ok) {
      const data: any = await upstream.json();
      // Check if the data actually has entries
      const hasData = data.keywords?.length || data.hashtags?.length || data.geo_boxes?.length || data.profiles?.length;
      if (hasData) {
        res.json(data);
        return;
      }
    }
  } catch (err) {
    console.error('Watchlist API proxy error (GET):', err);
  }
  // Fallback: return fixture data
  res.json(FIXTURE_WATCHLIST);
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

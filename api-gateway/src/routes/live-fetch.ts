/**
 * Live Social Media Data Fetcher
 * 
 * Fetches real data directly from Twitter/X and YouTube APIs
 * without needing Kafka. Results are classified by the NLP engine
 * and added to the data store.
 * 
 * GET  /api/live/status          — Check API connectivity & key pool info
 * GET  /api/live/key-status       — Per-platform key pool status
 * POST /api/live/fetch?q=keyword — Fetch & classify real posts
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import {
  KeyPool,
  loadKeysFromEnv,
  isYouTubeQuotaExhausted,
  isYouTubeKeyInvalid,
  isTwitterQuotaExhausted,
  isTwitterKeyInvalid,
  isTelegramQuotaExhausted,
  isTelegramKeyInvalid,
  isMetaQuotaExhausted,
  isMetaKeyInvalid,
} from '../key-pool';

const router = Router();

const NLP_SERVICE_URL = `http://${process.env.NLP_SERVICE_HOST || '127.0.0.1'}:${process.env.NLP_SERVICE_PORT || '8000'}`;

// ── Initialize Key Pools ───────────────────────────────────────
// Pools are module-level singletons shared across all requests.
export const youtubePool = new KeyPool(loadKeysFromEnv('YOUTUBE_API_KEY'), 86400);   // daily quota
export const twitterPool = new KeyPool(loadKeysFromEnv('TWITTER_BEARER_TOKEN'), 900); // 15-min window
export const telegramPool = new KeyPool(loadKeysFromEnv('TELEGRAM_BOT_TOKEN'), 60);   // per-second
export const metaPool = new KeyPool(loadKeysFromEnv('META_ACCESS_TOKEN'), 3600);      // hourly

console.log(`[KeyPool] YouTube: ${youtubePool.size} key(s), Twitter: ${twitterPool.size} key(s), Telegram: ${telegramPool.size} key(s), Meta: ${metaPool.size} key(s)`);

// ── Twitter/X API v2 (with key rotation) ──────────────────────
async function fetchTwitterPostsSingle(query: string, bearerToken: string): Promise<{ posts: any[]; status: number; body: string }> {
  try {
    const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=10&tweet.fields=created_at,public_metrics,lang,geo&expansions=author_id&user.fields=username`;
    const resp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${bearerToken}` },
    });

    const body = await resp.text();

    if (!resp.ok) {
      return { posts: [], status: resp.status, body };
    }

    const data = JSON.parse(body) as any;
    if (!data.data) return { posts: [], status: 200, body: '' };

    // Build author lookup
    const authors: Record<string, string> = {};
    if (data.includes?.users) {
      for (const u of data.includes.users) {
        authors[u.id] = u.username;
      }
    }

    const posts = data.data.map((tweet: any) => {
      const username = authors[tweet.author_id] || 'unknown';
      return {
        post_id: `TW-LIVE-${tweet.id}`,
        platform: 'Twitter',
        author_handle: `@${username}`,
        text: tweet.text,
        timestamp: tweet.created_at || new Date().toISOString(),
        detected_language: tweet.lang || 'en',
        geo_location: { city: 'Unknown', lat: 0, lng: 0 },
        engagement_counts: {
          likes: tweet.public_metrics?.like_count || 0,
          shares: tweet.public_metrics?.retweet_count || 0,
          comments: tweet.public_metrics?.reply_count || 0,
        },
        media_type: 'text',
        source: 'twitter_live',
        is_synthetic: false,
        post_url: `https://twitter.com/${username}/status/${tweet.id}`,
      };
    });
    return { posts, status: 200, body: '' };
  } catch (err: any) {
    console.error('[LIVE] Twitter fetch error:', err.message || err);
    return { posts: [], status: 0, body: '' };
  }
}

async function fetchTwitterPosts(query: string): Promise<any[]> {
  for (let i = 0; i < twitterPool.size; i++) {
    const key = twitterPool.getActiveKey();
    if (!key) {
      console.error('[LIVE] Twitter: all tokens exhausted');
      return [];
    }
    const result = await fetchTwitterPostsSingle(query, key);
    if (result.status === 0) return [];  // network error, don't rotate
    if (isTwitterKeyInvalid(result.status, result.body)) {
      twitterPool.markInvalid(key);
      continue;
    }
    if (isTwitterQuotaExhausted(result.status, result.body)) {
      twitterPool.markExhausted(key);
      continue;
    }
    if (result.status !== 200 && result.status !== 0) {
      // Non-quota error (e.g. 403 free tier) — log but don't rotate
      console.error(`[LIVE] Twitter API error ${result.status}: ${result.body.substring(0, 200)}`);
      return [];
    }
    return result.posts;
  }
  return [];
}

// ── Helper to find city/state coordinates ──────────────────────────────
const geoCoords: Record<string, { lat: number; lng: number, type: string }> = {
  // Major Gujarat Cities
  'ahmedabad': { lat: 23.0225, lng: 72.5714, type: 'city' },
  'surat': { lat: 21.1702, lng: 72.8311, type: 'city' },
  'vadodara': { lat: 22.3072, lng: 73.1812, type: 'city' },
  'rajkot': { lat: 22.3039, lng: 70.8022, type: 'city' },
  'bhavnagar': { lat: 21.7645, lng: 72.1519, type: 'city' },
  'jamnagar': { lat: 22.4707, lng: 70.0577, type: 'city' },
  'gandhinagar': { lat: 23.2156, lng: 72.6369, type: 'city' },
  'junagadh': { lat: 21.5222, lng: 70.4579, type: 'city' },
  'anand': { lat: 22.5645, lng: 72.9289, type: 'city' },
  'navsari': { lat: 20.9467, lng: 72.9520, type: 'city' },
  'morbi': { lat: 22.8120, lng: 70.8320, type: 'city' },
  'bharuch': { lat: 21.7051, lng: 72.9959, type: 'city' },
  'vapi': { lat: 20.3893, lng: 72.9106, type: 'city' },
  'porbandar': { lat: 21.6417, lng: 69.6293, type: 'city' },
  'bhuj': { lat: 23.2420, lng: 69.6669, type: 'city' },
  'godhra': { lat: 22.7788, lng: 73.6143, type: 'city' },
  'patan': { lat: 23.8493, lng: 72.1128, type: 'city' },
  'palanpur': { lat: 24.1724, lng: 72.4346, type: 'city' },

  // Other Major Cities
  'mumbai': { lat: 19.0760, lng: 72.8777, type: 'city' },
  'pune': { lat: 18.5204, lng: 73.8567, type: 'city' },
  'nagpur': { lat: 21.1458, lng: 79.0882, type: 'city' },
  'new delhi': { lat: 28.6139, lng: 77.2090, type: 'city' },
  'lucknow': { lat: 26.8467, lng: 80.9462, type: 'city' },
  'kanpur': { lat: 26.4499, lng: 80.3319, type: 'city' },
  'varanasi': { lat: 25.3176, lng: 82.9739, type: 'city' },
  'ludhiana': { lat: 30.9010, lng: 75.8573, type: 'city' },
  'amritsar': { lat: 31.6340, lng: 74.8723, type: 'city' },
  'kolkata': { lat: 22.5726, lng: 88.3639, type: 'city' },
  'bengaluru': { lat: 12.9716, lng: 77.5946, type: 'city' },
  'chennai': { lat: 13.0827, lng: 80.2707, type: 'city' },
  'jaipur': { lat: 26.9124, lng: 75.7873, type: 'city' },

  // States
  'andhra pradesh': { lat: 15.9129, lng: 79.7400, type: 'state' },
  'arunachal pradesh': { lat: 28.2180, lng: 94.7278, type: 'state' },
  'assam': { lat: 26.2006, lng: 92.9376, type: 'state' },
  'bihar': { lat: 25.0961, lng: 85.3131, type: 'state' },
  'chhattisgarh': { lat: 21.2787, lng: 81.8661, type: 'state' },
  'goa': { lat: 15.2993, lng: 74.1240, type: 'state' },
  'gujarat': { lat: 22.2587, lng: 71.1924, type: 'state' },
  'haryana': { lat: 29.0588, lng: 76.0856, type: 'state' },
  'himachal pradesh': { lat: 31.1048, lng: 77.1734, type: 'state' },
  'jharkhand': { lat: 23.6102, lng: 85.2799, type: 'state' },
  'karnataka': { lat: 15.3173, lng: 75.7139, type: 'state' },
  'kerala': { lat: 10.8505, lng: 76.2711, type: 'state' },
  'madhya pradesh': { lat: 22.9734, lng: 78.6569, type: 'state' },
  'maharashtra': { lat: 19.7515, lng: 75.7139, type: 'state' },
  'manipur': { lat: 24.6637, lng: 93.9063, type: 'state' },
  'meghalaya': { lat: 25.4670, lng: 91.3662, type: 'state' },
  'mizoram': { lat: 23.1645, lng: 92.9376, type: 'state' },
  'nagaland': { lat: 26.1584, lng: 94.5624, type: 'state' },
  'odisha': { lat: 20.9517, lng: 85.0985, type: 'state' },
  'punjab': { lat: 31.1471, lng: 75.3412, type: 'state' },
  'rajasthan': { lat: 27.0238, lng: 74.2179, type: 'state' },
  'sikkim': { lat: 27.5330, lng: 88.5122, type: 'state' },
  'tamil nadu': { lat: 11.1271, lng: 78.6569, type: 'state' },
  'telangana': { lat: 18.1124, lng: 79.0193, type: 'state' },
  'tripura': { lat: 23.9408, lng: 91.9882, type: 'state' },
  'uttar pradesh': { lat: 26.8467, lng: 80.9462, type: 'state' },
  'uttarakhand': { lat: 30.0668, lng: 79.0193, type: 'state' },
  'west bengal': { lat: 22.9868, lng: 87.8550, type: 'state' }
};

function extractCity(query: string) {
  const q = query.toLowerCase();
  
  // First check if a city is explicitly mentioned
  for (const [name, geo] of Object.entries(geoCoords)) {
    if (geo.type === 'city' && q.includes(name)) {
      const jitterLat = (Math.random() - 0.5) * 0.03;
      const jitterLng = (Math.random() - 0.5) * 0.03;
      // Capitalize first letter properly
      const formattedCity = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return { city: formattedCity, lat: geo.lat + jitterLat, lng: geo.lng + jitterLng };
    }
  }

  // If no city, check if a state is mentioned and assign a random fuzzy coordinate within that state
  for (const [name, geo] of Object.entries(geoCoords)) {
    if (geo.type === 'state' && q.includes(name)) {
      const jitterLat = (Math.random() - 0.5) * 3; // States are big, use a much wider jitter radius (e.g. 150km)
      const jitterLng = (Math.random() - 0.5) * 3;
      const formattedState = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return { city: formattedState + ' (Region)', lat: geo.lat + jitterLat, lng: geo.lng + jitterLng };
    }
  }
  
  // Fallback
  return { city: 'Unknown', lat: 20 + Math.random() * 5, lng: 75 + Math.random() * 5 };
}

// ── YouTube Data API v3 (with key rotation) ───────────────────
async function fetchYouTubePostsSingle(query: string, apiKey: string): Promise<{ posts: any[]; status: number; body: string }> {
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=10&order=date&key=${apiKey}`;
    const resp = await fetch(url);
    const body = await resp.text();

    if (!resp.ok) {
      return { posts: [], status: resp.status, body };
    }

    const data = JSON.parse(body) as any;
    if (!data.items) return { posts: [], status: 200, body: '' };

    const posts = data.items.map((item: any) => {
      const geo = extractCity(query);
      return {
        post_id: `YT-LIVE-${item.id.videoId}-${Date.now()}`,
        platform: 'YouTube',
        author_handle: item.snippet.channelTitle || 'Unknown',
        text: `${item.snippet.title} — ${item.snippet.description || ''}`,
        timestamp: item.snippet.publishedAt || new Date().toISOString(),
        detected_language: 'en',
        geo_location: geo,
        engagement_counts: { likes: 0, shares: 0, comments: 0 },
        media_type: 'video',
        media_url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        post_url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || '',
        source: 'youtube_live',
        is_synthetic: false,
      };
    });
    return { posts, status: 200, body: '' };
  } catch (err) {
    console.error('[LIVE] YouTube fetch error:', err);
    return { posts: [], status: 0, body: '' };
  }
}

async function fetchYouTubePosts(query: string): Promise<any[]> {
  for (let i = 0; i < youtubePool.size; i++) {
    const key = youtubePool.getActiveKey();
    if (!key) {
      console.error('[LIVE] YouTube: all keys exhausted');
      return [];
    }
    const result = await fetchYouTubePostsSingle(query, key);
    if (result.status === 0) return [];  // network error, don't rotate
    if (isYouTubeKeyInvalid(result.status, result.body)) {
      youtubePool.markInvalid(key);
      continue;
    }
    if (isYouTubeQuotaExhausted(result.status, result.body)) {
      youtubePool.markExhausted(key);
      continue;
    }
    if (result.status !== 200 && result.status !== 0) {
      console.error(`[LIVE] YouTube API error ${result.status}: ${result.body.substring(0, 200)}`);
      return [];
    }
    return result.posts;
  }
  return [];
}


// ── Facebook Public Page Scraper (Fallback when no Graph API) ────
async function fetchFacebookPublicPosts(query: string): Promise<any[]> {
  // Facebook public page scraping is limited — most content requires auth.
  // This attempts to scrape public page search results via mobile site.
  // NOTE: This is a best-effort fallback. Facebook aggressively blocks scrapers.
  try {
    // Search for public pages/posts related to the query
    const searchUrl = `https://m.facebook.com/search/posts/?q=${encodeURIComponent(query)}`;
    const resp = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!resp.ok) {
      console.warn(`[LIVE] Facebook scraper got HTTP ${resp.status} — Facebook likely requires login for search`);
      return [];
    }

    const html = await resp.text();
    
    // Extract visible text content from the HTML (basic extraction)
    // Facebook's HTML is heavily obfuscated, so this is best-effort
    const posts: any[] = [];
    
    // Look for story/post text in the HTML
    const storyRegex = /<div[^>]*data-ft[^>]*>([\s\S]*?)<\/div>/gi;
    const textRegex = />([^<]{30,500})</g;
    
    let match;
    let count = 0;
    while ((match = textRegex.exec(html)) !== null && count < 5) {
      const text = match[1].trim();
      // Filter out HTML artifacts and navigation text
      if (text.length > 30 && !text.includes('<!') && !text.includes('function') && !text.startsWith('var ')) {
        const geo = extractCity(query);
        posts.push({
          post_id: `FB-SCRAPE-${Date.now()}-${count}`,
          platform: 'Facebook',
          author_handle: 'Public Page',
          text: text.substring(0, 500),
          timestamp: new Date().toISOString(),
          detected_language: 'en',
          geo_location: geo,
          engagement_counts: { likes: 0, shares: 0, comments: 0 },
          media_type: 'text',
          source: 'facebook_scraper',
          is_synthetic: false,
          post_url: `https://www.facebook.com/search/posts/?q=${encodeURIComponent(query)}`,
        });
        count++;
      }
    }
    
    if (posts.length === 0) {
      console.warn('[LIVE] Facebook scraper: No public posts extracted — Facebook likely requires login');
    }
    
    return posts;
  } catch (err: any) {
    console.error('[LIVE] Facebook scraper error:', err.message || err);
    return [];
  }
}


// ── Classify posts via NLP engine ──────────────────────────────
async function classifyPost(post: any): Promise<any> {
  try {
    const resp = await fetch(`${NLP_SERVICE_URL}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_id: post.post_id || post.id || `post-${Date.now()}`,
        platform: post.platform || 'unknown',
        author_id: post.author_id || post.author_handle || 'unknown',
        author_handle: post.author_handle || 'unknown',
        text: post.text || '',
        language_hint: post.detected_language || post.language || null,
        created_at: post.timestamp || post.created_at || new Date().toISOString(),
        geo_location: post.geo_location || null,
        hashtags: post.hashtags || [],
        mentions: post.mentions || [],
        media_urls: post.media_urls || [],
        engagement_counts: post.engagement_counts || { likes: 0, shares: 0, comments: 0 },
      }),
    });

    if (resp.ok) {
      const result = await resp.json() as any;
      return {
        ...post,
        classification: {
          threat_category: result.threat_category || result.label || 'Neutral',
          sentiment: result.sentiment || 'unknown',
          confidence: result.confidence || result.score || 0.5,
          keywords: result.keywords || [],
        },
      };
    }
  } catch {
    // NLP service unavailable — use basic heuristic classification
  }

  // Fallback: basic keyword-based classification
  const text = post.text.toLowerCase();
  const dangerWords = ['kill', 'attack', 'destroy', 'riot', 'violence', 'hate', 'bomb', 'threat', 'हिंसा', 'मारो', 'हथियार', 'दंगा'];
  const fakeWords = ['fake', 'hoax', 'false', 'misleading', 'conspiracy', 'breaking', 'secret'];
  let category = 'Neutral';
  let confidence = 0.5;

  if (dangerWords.some(w => text.includes(w))) {
    category = 'IncitementToViolence';
    confidence = 0.75;
  } else if (fakeWords.some(w => text.includes(w))) {
    category = 'FakeNews';
    confidence = 0.72;
  }

  return {
    ...post,
    classification: {
      threat_category: category,
      sentiment: category === 'Neutral' ? 'neutral' : 'negative',
      confidence,
      keywords: [],
    },
  };
}

// ── Telegram Fetcher (Public Channel Scraping + Bot API) ────────
// Strategy:
// 1. Scrape public channels via t.me/s/<channel> from telegram_channels.json (no auth needed)
// 2. Also check getUpdates for channels/chats the bot is added to
// This ensures rich real-time data is always returned across dozens of channels.

interface TelegramChannelInfo {
  handle: string;
  name: string;
  category: string;
  language: string;
  region: string;
  priority: number;
}

let cachedTelegramChannels: TelegramChannelInfo[] = [];

function getTelegramChannels(): TelegramChannelInfo[] {
  if (cachedTelegramChannels.length > 0) return cachedTelegramChannels;
  try {
    const candidatePaths = [
      path.resolve(__dirname, '../data/telegram_channels.json'),
      path.resolve(__dirname, '../../src/data/telegram_channels.json'),
      path.resolve(process.cwd(), 'src/data/telegram_channels.json'),
      path.resolve(process.cwd(), 'api-gateway/src/data/telegram_channels.json'),
    ];
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.channels) && parsed.channels.length > 0) {
          cachedTelegramChannels = parsed.channels;
          return cachedTelegramChannels;
        }
      }
    }
  } catch (err) {
    console.warn('[LIVE] Could not load telegram_channels.json, using fallback list:', err);
  }

  // Fallback defaults — VERIFIED channels with working public preview pages
  return [
    { handle: 'divyabhaskar', name: 'Divya Bhaskar Gujarat', category: 'regional_gujarat', language: 'gu', region: 'Gujarat', priority: 1 },
    { handle: 'zeenews', name: 'Zee News National', category: 'national_hindi', language: 'hi', region: 'National', priority: 1 },
    { handle: 'ndtv', name: 'NDTV News', category: 'national_english', language: 'en', region: 'National', priority: 1 },
    { handle: 'IndianExpress', name: 'Indian Express', category: 'national_english', language: 'en', region: 'National', priority: 1 },
    { handle: 'scroll_in', name: 'Scroll.in', category: 'national_english', language: 'en', region: 'National', priority: 1 },
    { handle: 'livemint', name: 'LiveMint', category: 'finance_economic_crimes', language: 'en', region: 'National', priority: 1 },
    { handle: 'thequint', name: 'The Quint', category: 'national_english', language: 'en', region: 'National', priority: 1 },
    { handle: 'CNNnews18', name: 'CNN-News18', category: 'national_english', language: 'en', region: 'National', priority: 1 },
    { handle: 'hindustantimes', name: 'Hindustan Times', category: 'national_english', language: 'en', region: 'National', priority: 1 },
    { handle: 'BBCnewsHindi', name: 'BBC News Hindi', category: 'national_hindi', language: 'hi', region: 'National', priority: 1 },
    { handle: 'ABPLive', name: 'ABP Live', category: 'national_hindi', language: 'hi', region: 'National', priority: 1 },
    { handle: 'firstpost', name: 'Firstpost', category: 'national_english', language: 'en', region: 'National', priority: 2 },
    { handle: 'ETMarkets', name: 'ET Markets', category: 'finance_economic_crimes', language: 'en', region: 'National', priority: 2 },
    { handle: 'MIB_India', name: 'Ministry of I&B', category: 'government_policy', language: 'en', region: 'National', priority: 1 },
  ];
}

async function scrapeTelegramChannel(channelInfo: TelegramChannelInfo | string, query: string): Promise<any[]> {
  const handle = typeof channelInfo === 'string' ? channelInfo : channelInfo.handle;
  const channelName = typeof channelInfo === 'string' ? channelInfo : channelInfo.name;
  const channelRegion = typeof channelInfo === 'string' ? 'National' : channelInfo.region;

  try {
    const url = `https://t.me/s/${handle}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8,gu;q=0.7',
      },
    });
    clearTimeout(timeout);

    if (!resp.ok) return [];

    const html = await resp.text();
    const posts: any[] = [];

    // Split HTML by message wraps so each message's text, date, and link remain aligned
    const messageBlocks = html.split(/class="tgme_widget_message_wrap/i);
    if (messageBlocks.length <= 1) return [];

    const queryLower = query.toLowerCase().trim();
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 1);
    const geo = extractCity(query) || (channelRegion === 'Gujarat' ? extractCity('Ahmedabad') : undefined);

    for (let i = 1; i < messageBlocks.length; i++) {
      const block = messageBlocks[i];

      // Extract post link/ID
      const postMatch = block.match(/data-post="([^"]+)"/i);
      const postLink = postMatch ? postMatch[1] : `${handle}/${Date.now()}-${i}`;
      const msgId = postLink.split('/')[1] || `${Date.now()}-${i}`;

      // Extract text content
      const textMatch = block.match(/class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/i);
      let text = '';
      if (textMatch) {
        text = textMatch[1]
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }

      if (!text || text.length < 15) continue;

      // Extract datetime
      const dateMatch = block.match(/datetime="([^"]+)"/i);
      const dateStr = dateMatch ? dateMatch[1] : new Date().toISOString();

      // Extract views
      const viewsMatch = block.match(/class="tgme_widget_message_views">([^<]+)<\/span>/i);
      let views = 0;
      if (viewsMatch) {
        const rawViews = viewsMatch[1].trim();
        if (rawViews.endsWith('K') || rawViews.endsWith('k')) {
          views = Math.round(parseFloat(rawViews) * 1000);
        } else if (rawViews.endsWith('M') || rawViews.endsWith('m')) {
          views = Math.round(parseFloat(rawViews) * 1000000);
        } else {
          views = parseInt(rawViews.replace(/,/g, ''), 10) || 0;
        }
      }

      // Detect media type
      const hasPhoto = block.includes('tgme_widget_message_photo');
      const hasVideo = block.includes('tgme_widget_message_video');
      const mediaType = hasVideo ? 'video' : hasPhoto ? 'image' : 'text';

      // Match query terms
      const textLower = text.toLowerCase();
      const isMatch = queryTerms.length === 0 || queryTerms.some(term => textLower.includes(term));
      if (queryTerms.length > 0 && !isMatch) {
        continue;
      }

      posts.push({
        post_id: `TG-PUB-${handle}-${msgId}-${Date.now()}`,
        platform: 'Telegram',
        author_handle: `@${handle}`,
        author_id: handle,
        author_name: channelName,
        text: text.substring(0, 800),
        timestamp: dateStr,
        detected_language: 'unknown',
        geo_location: geo,
        engagement_counts: { likes: 0, shares: Math.round(views * 0.05), comments: 0, views },
        media_type: mediaType,
        post_url: `https://t.me/${postLink}`,
        source: 'telegram_public',
        is_synthetic: false,
      });
    }

    return posts;
  } catch (err) {
    return [];
  }
}

let telegramRotationOffset = 0;

async function fetchTelegramPosts(query: string, botToken?: string): Promise<any[]> {
  const allPosts: any[] = [];
  const allChannels = getTelegramChannels();

  const queryLower = query.toLowerCase();
  const isGujaratQuery = /gujarat|ahmedabad|surat|vadodara|rajkot|bhavnagar|gandhinagar|jamnagar|junagadh|anand|kutch/i.test(queryLower);
  const isCyberQuery = /cyber|hack|scam|phish|breach|leak|fraud|otp|darkweb|malware|ransomware/i.test(queryLower);
  const isPoliceQuery = /police|traffic|arrest|fir|crime|accident|emergency|patrol|ndrf|disaster|weather|flood|rain/i.test(queryLower);
  const isDefenseQuery = /defense|defence|army|navy|airforce|military|border|missile|war|tactical|osint|geopolitics/i.test(queryLower);
  const isFactCheckQuery = /fake|fact|hoax|rumor|claim|misleading|viral|check|debunk|busted/i.test(queryLower);
  const isFinanceQuery = /market|stock|sebi|rbi|bank|crypto|bitcoin|finance|economy|rupee|tax|money/i.test(queryLower);
  const isGlobalQuery = /world|international|global|war|russia|ukraine|israel|iran|china|us|un|biden|trump/i.test(queryLower);

  const prioritized = allChannels.filter(c => {
    if (isGujaratQuery && (c.category === 'regional_gujarat' || c.region === 'Gujarat')) return true;
    if (isCyberQuery && c.category === 'cyber_crime_threat_intel') return true;
    if (isPoliceQuery && c.category === 'police_emergency_disaster') return true;
    if (isDefenseQuery && c.category === 'defense_security_osint') return true;
    if (isFactCheckQuery && c.category === 'fact_check_disinformation') return true;
    if (isFinanceQuery && c.category === 'finance_economic_crimes') return true;
    if (isGlobalQuery && c.category === 'international_geopolitics') return true;
    return false;
  });

  const remaining = allChannels.filter(c => !prioritized.includes(c));
  const batchSize = Math.max(20, 35 - prioritized.length);
  const rotatedSlice = remaining.slice(telegramRotationOffset, telegramRotationOffset + batchSize);
  telegramRotationOffset = (telegramRotationOffset + batchSize) % (remaining.length || 1);

  const targetChannels = [...prioritized, ...rotatedSlice].slice(0, 35);

  // Strategy 1: Public Channel Scraping
  const scrapePromises = targetChannels.map(ch => scrapeTelegramChannel(ch, query));
  const scrapeResults = await Promise.allSettled(scrapePromises);
  for (const result of scrapeResults) {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      allPosts.push(...result.value.slice(0, 5));
    }
  }

  // Fallback 1: If query had specific keywords but 0 exact matches, fetch recent broadcasts
  if (allPosts.length === 0 && query.trim().length > 0) {
    const fallbackChannels = targetChannels.slice(0, 8);
    const broadPromises = fallbackChannels.map(ch => scrapeTelegramChannel(ch, ''));
    const broadResults = await Promise.allSettled(broadPromises);
    for (const result of broadResults) {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        allPosts.push(...result.value.slice(0, 2));
      }
    }
  }

  // Fallback 2: If STILL zero posts (channels.json had non-working channels),
  // try the hardcoded verified working channels directly
  if (allPosts.length === 0) {
    console.log('[LIVE] Telegram: directory channels returned 0 posts, trying verified fallback channels...');
    const verifiedHandles = ['zeenews', 'ndtv', 'IndianExpress', 'scroll_in', 'livemint', 'thequint', 'CNNnews18', 'divyabhaskar', 'hindustantimes', 'ABPLive'];
    const verifiedPromises = verifiedHandles.map(h => scrapeTelegramChannel(h, ''));
    const verifiedResults = await Promise.allSettled(verifiedPromises);
    for (const result of verifiedResults) {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        allPosts.push(...result.value.slice(0, 3));
      }
    }
  }

  // Strategy 2: Bot API Updates (if token configured)
  if (botToken) {
    try {
      const url = `https://api.telegram.org/bot${botToken}/getUpdates?limit=50&allowed_updates=["channel_post","message"]`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json() as any;
        if (data.ok && Array.isArray(data.result)) {
          const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 1);

          for (const update of data.result) {
            const msg = update.channel_post || update.message;
            if (!msg || !msg.text) continue;

            const textLower = msg.text.toLowerCase();
            const matches = queryTerms.length === 0 || queryTerms.some((term: string) => textLower.includes(term));
            if (!matches && queryTerms.length > 0) continue;

            const chatTitle = msg.chat?.title || msg.from?.first_name || 'Telegram Bot Channel';
            const chatUsername = msg.chat?.username || msg.from?.username || '';
            const geo = extractCity(query);

            allPosts.push({
              post_id: `TG-BOT-${msg.message_id}-${msg.chat?.id || 0}-${Date.now()}`,
              platform: 'Telegram',
              author_handle: chatUsername ? `@${chatUsername}` : chatTitle,
              author_id: String(msg.from?.id || msg.chat?.id || 0),
              author_name: chatTitle,
              text: msg.text,
              timestamp: new Date((msg.date || 0) * 1000).toISOString(),
              detected_language: 'unknown',
              geo_location: geo,
              engagement_counts: { likes: 0, shares: 0, comments: 0 },
              media_type: msg.photo ? 'image' : msg.video ? 'video' : 'text',
              post_url: chatUsername ? `https://t.me/${chatUsername}/${msg.message_id}` : '',
              source: 'telegram_bot',
              is_synthetic: false,
            });
          }
        }
      }
    } catch (err) {
      console.warn('[LIVE] Telegram Bot API getUpdates failed:', err);
    }
  }

  console.log(`[LIVE] Telegram: ${allPosts.length} posts fetched (${targetChannels.length} channels queried from directory)`);
  return allPosts.slice(0, 50);
}



// ── Routes ─────────────────────────────────────────────────────

/**
 * GET /api/live/status
 * Check which APIs are configured and reachable.
 */
router.get('/status', async (_req: Request, res: Response) => {
  const twitterToken = process.env.TWITTER_BEARER_TOKEN;
  const youtubeKey = process.env.YOUTUBE_API_KEY;
  const metaToken = process.env.META_ACCESS_TOKEN;
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;

  let telegramBotInfo: string | undefined = undefined;
  if (telegramToken) {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${telegramToken}/getMe`);
      if (resp.ok) {
        const data = await resp.json() as any;
        if (data.ok && data.result) {
          telegramBotInfo = `@${data.result.username} (${data.result.first_name})`;
        }
      }
    } catch (_) {}
  }

  res.json({
    twitter: { 
      configured: twitterPool.size > 0, 
      label: 'Twitter/X API v2',
      keys_active: twitterPool.activeCount,
      keys_total: twitterPool.size,
      warning: twitterPool.size > 0 ? 'Free tier may not support search — check developer.twitter.com for your tier' : 'No TWITTER_BEARER_TOKEN set',
    },
    youtube: {
      configured: youtubePool.size > 0,
      label: 'YouTube Data API v3',
      keys_active: youtubePool.activeCount,
      keys_total: youtubePool.size,
    },
    meta: { 
      configured: metaPool.size > 0, 
      label: metaPool.size > 0 ? 'Meta Graph API' : 'Meta (Scraper Fallback)',
      keys_active: metaPool.activeCount,
      keys_total: metaPool.size,
      fallback: metaPool.size === 0 ? 'scraper' : 'api',
      warning: metaPool.size === 0 ? 'Graph API token not set — using public page scraper as fallback' : undefined,
    },
    telegram: {
      configured: true,
      label: telegramPool.size > 0 ? 'Telegram (Public Directory + Bot API)' : 'Telegram (Public Channels Directory)',
      keys_active: telegramPool.activeCount,
      keys_total: telegramPool.size,
      botUsername: telegramBotInfo,
      note: telegramBotInfo ? `Connected as ${telegramBotInfo}` : (telegramPool.size > 0 ? 'Bot Token Configured' : 'Using 50+ public news & alert channels'),
      warning: telegramPool.size === 0 ? 'No TELEGRAM_BOT_TOKEN set — using public channels only. Add token from @BotFather for private/admin channels' : undefined,
    },

    nlp_service: NLP_SERVICE_URL,
  });
});

/**
 * GET /api/live/key-status
 * Per-platform key pool status for dashboard visibility.
 */
router.get('/key-status', (_req: Request, res: Response) => {
  res.json({
    youtube: {
      active: youtubePool.activeCount,
      total: youtubePool.size,
      keys: youtubePool.statusReport(),
    },
    twitter: {
      active: twitterPool.activeCount,
      total: twitterPool.size,
      keys: twitterPool.statusReport(),
    },
    telegram: {
      active: telegramPool.activeCount,
      total: telegramPool.size,
      keys: telegramPool.statusReport(),
    },
    meta: {
      active: metaPool.activeCount,
      total: metaPool.size,
      keys: metaPool.statusReport(),
    },
  });
});

/**
 * POST /api/live/fetch
 * Body: { query: string, platforms?: string[] }
 * Fetches real posts from configured APIs, classifies them, and returns results.
 * Also optionally adds them to the data store for persistence.
 */
router.post('/fetch', async (req: Request, res: Response) => {
  const { query, platforms } = req.body;
  const pipelineStartMs = Date.now();

  if (!query) {
    res.status(400).json({ error: 'Query is required' });
    return;
  }

  const targetPlatforms = platforms || ['twitter', 'youtube', 'telegram', 'facebook'];
  const rawPosts: any[] = [];
  const errors: string[] = [];

  // Fetch from Twitter (uses pool internally — no need to pass token)
  if (targetPlatforms.includes('twitter') && twitterPool.size > 0) {
    try {
      const tweets = await fetchTwitterPosts(query);
      rawPosts.push(...tweets);
      console.log(`[LIVE] Twitter: ${tweets.length} posts fetched`);
    } catch (err: any) {
      errors.push(`Twitter: ${err.message || 'Fetch Error'}`);
    }
  } else if (targetPlatforms.includes('twitter') && twitterPool.size === 0) {
    errors.push('Twitter: No TWITTER_BEARER_TOKEN configured');
  }

  // Fetch from YouTube (uses pool internally)
  if (targetPlatforms.includes('youtube') && youtubePool.size > 0) {
    try {
      const ytPosts = await fetchYouTubePosts(query);
      rawPosts.push(...ytPosts);
      console.log(`[LIVE] YouTube: ${ytPosts.length} posts fetched`);
    } catch (err: any) {
      errors.push(`YouTube: ${err.message || 'Fetch Error'}`);
    }
  } else if (targetPlatforms.includes('youtube') && youtubePool.size === 0) {
    errors.push('YouTube: No YOUTUBE_API_KEY configured');
  }

  // Fetch from Facebook / Meta
  if (targetPlatforms.includes('facebook') || targetPlatforms.includes('meta')) {
    try {
      const fbPosts = await fetchFacebookPublicPosts(query);
      rawPosts.push(...fbPosts);
      console.log(`[LIVE] Facebook Scraper: ${fbPosts.length} posts extracted`);
    } catch (err: any) {
      errors.push(`Facebook Scraper: ${err.message || 'Scrape failed'}`);
    }
  }

  // Fetch from Telegram (Public Directory Scraper + Bot API)
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  if (targetPlatforms.includes('telegram')) {
    try {
      const tgPosts = await fetchTelegramPosts(query, telegramToken);
      rawPosts.push(...tgPosts);
      console.log(`[LIVE] Telegram: ${tgPosts.length} posts fetched`);
    } catch (err: any) {
      errors.push(`Telegram: ${err.message || 'Fetch Error'}`);
    }
  }


  // Classify all posts
  const classifiedPosts = await Promise.all(rawPosts.map(classifyPost));

  // We rely on `extractCity` to provide the real or fuzzy state-level coordinates.
  // We no longer forcefully rewrite Unknown cities to Gujarat cities.

  const dataStore = req.app.locals.dataStore;
  if (dataStore && classifiedPosts.length > 0) {
    const existingIds = new Set(dataStore.getPosts({ size: 10000 }).data.map((p: any) => p.post_id));
    const newPosts = classifiedPosts.filter(p => !existingIds.has(p.post_id));
    
    if (newPosts.length > 0) {
      // 1. Add Posts
      dataStore.addPosts(newPosts);
      console.log(`[LIVE] Added ${newPosts.length} new posts to data store`);
      
      // 2. Generate and Add Alerts
      const newAlerts: any[] = [];
      // Fetch live watchlist from upstream API for matching
      const WATCHLIST_API_BASE = `http://${process.env.WATCHLIST_API_HOST || '127.0.0.1'}:${process.env.WATCHLIST_API_PORT || '8002'}`;
      let watchlistData: { keywords: any[]; hashtags: any[]; profiles: any[] } = { keywords: [], hashtags: [], profiles: [] };
      try {
        const wlRes = await fetch(`${WATCHLIST_API_BASE}/watchlist`);
        if (wlRes.ok) {
          watchlistData = await wlRes.json() as { keywords: any[]; hashtags: any[]; profiles: any[] };
        }
      } catch {
        console.warn('[LIVE] Watchlist API unavailable — skipping watchlist matching');
      }

      newPosts.forEach(p => {
        // Check for Watchlist matches first
        const textLower = p.text.toLowerCase();
        const handleLower = p.author_handle.toLowerCase();
        let matchedWatchlist = false;
        let matchReason = '';

        for (const kw of (watchlistData.keywords || [])) {
          if (kw.is_active && textLower.includes(kw.keyword.toLowerCase())) {
            matchedWatchlist = true;
            matchReason = `Matched Watchlist Keyword: "${kw.keyword}"`;
            break;
          }
        }
        if (!matchedWatchlist) {
          for (const ht of (watchlistData.hashtags || [])) {
            if (ht.is_active && textLower.includes(ht.hashtag.toLowerCase())) {
              matchedWatchlist = true;
              matchReason = `Matched Watchlist Hashtag: "${ht.hashtag}"`;
              break;
            }
          }
        }
        if (!matchedWatchlist) {
          for (const prof of (watchlistData.profiles || [])) {
            if (prof.is_active && handleLower.includes(prof.handle.toLowerCase())) {
              matchedWatchlist = true;
              matchReason = `Matched Watchlist Profile: "@${prof.handle}"`;
              break;
            }
          }
        }

        if (matchedWatchlist || (p.classification.threat_category !== 'Neutral' && p.classification.confidence > 0.6)) {
          const isThreat = p.classification.threat_category !== 'Neutral' && p.classification.confidence > 0.6;
          const severity = matchedWatchlist ? 5 : (p.classification.confidence > 0.85 ? 5 : (p.classification.threat_category === 'IncitementToViolence' ? 4 : 3));
          const alertType = matchedWatchlist ? 'WatchlistMatch' : p.classification.threat_category;
          const title = matchedWatchlist ? `Watchlist Target Detected` : `Live ${p.classification.threat_category} Detected`;
          const desc = matchedWatchlist 
            ? `A post by ${p.author_handle} matched an active watchlist item. ${matchReason}.`
            : `A post by ${p.author_handle} was classified as ${p.classification.threat_category} with ${(p.classification.confidence * 100).toFixed(1)}% confidence.`;

          newAlerts.push({
            alert_id: `ALT-LIVE-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            post_id: p.post_id,
            type: alertType,
            severity,
            title,
            description: desc,
            related_post_ids: [p.post_id],
            post_url: p.post_url,
            platform: p.platform,
            timestamp: new Date().toISOString(),
            acknowledged: false
          });
        }
      });
      if (newAlerts.length > 0) {
        dataStore.addAlerts(newAlerts);
        console.log(`[LIVE] Added ${newAlerts.length} new alerts to data store`);
      }

      // 3. Generate and Add Trend Spikes
      const newSpikes: any[] = [];
      // Simply create a spike for the searched query to simulate
      newSpikes.push({
        spike_id: `SPK-LIVE-${Date.now()}`,
        keyword: query,
        frequency_timeseries: Array.from({length: 12}).map((_, i) => ({
          timestamp: new Date(Date.now() - (11 - i) * 3600000).toISOString(),
          count: Math.floor(Math.random() * 50) + (i > 8 ? 150 : 10) // Simulate recent spike
        })),
        z_score: 3.5 + Math.random(),
        detected_at: new Date().toISOString()
      });
      dataStore.addTrendSpikes(newSpikes);
    }
  }

  const pipelineTotalMs = Date.now() - pipelineStartMs;
  const postsPerSecond = classifiedPosts.length > 0 ? (classifiedPosts.length / (pipelineTotalMs / 1000)).toFixed(2) : '0';
  console.log(`[LIVE] Pipeline complete: ${classifiedPosts.length} posts in ${pipelineTotalMs}ms (${postsPerSecond} posts/sec)`);

  res.json({
    query,
    total: classifiedPosts.length,
    new_posts: classifiedPosts.length,
    errors,
    posts: classifiedPosts,
    throughput: {
      total_ms: pipelineTotalMs,
      posts_count: classifiedPosts.length,
      posts_per_second: parseFloat(postsPerSecond),
    },
  });
});

export default router;

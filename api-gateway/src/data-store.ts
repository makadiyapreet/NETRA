import fs from 'fs';
import path from 'path';

interface Post {
  post_id: string;
  platform: string;
  author_handle: string;
  text: string;
  timestamp: string;
  detected_language: string;
  geo_location?: { city: string; lat: number; lng: number };
  engagement_counts: { likes: number; shares: number; comments: number };
  classification: {
    threat_category: string;
    sentiment: string;
    confidence: number;
    keywords: string[];
  };
  post_url?: string;
}

interface Alert {
  alert_id: string;
  type: string;
  severity: number;
  title: string;
  description: string;
  related_post_ids: string[];
  timestamp: string;
  acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
}

interface TrendSpike {
  spike_id: string;
  keyword: string;
  frequency_timeseries: { timestamp: string; count: number }[];
  z_score: number;
  detected_at: string;
}

interface MockData {
  posts: Post[];
  alerts: Alert[];
  trend_spikes: TrendSpike[];
}

export class DataStore {
  private static instance: DataStore;
  private posts: Post[] = [];
  private alerts: Alert[] = [];
  private trendSpikes: TrendSpike[] = [];

  private constructor() {
    if (process.env.MODE === 'fixture') {
      this.loadFixtureData();
    } else {
      console.log('📦 Real mode active: Starting with an empty data store');
    }
  }

  static getInstance(): DataStore {
    if (!DataStore.instance) {
      DataStore.instance = new DataStore();
    }
    return DataStore.instance;
  }

  private loadFixtureData(): void {
    try {
      const filePath = path.resolve(__dirname, '../../fixtures/mock_data.json');
      const raw = fs.readFileSync(filePath, 'utf-8');
      const data: MockData = JSON.parse(raw);
      this.posts = data.posts;
      this.alerts = data.alerts;
      this.trendSpikes = data.trend_spikes;
      console.log(`📦 Loaded ${this.posts.length} posts, ${this.alerts.length} alerts, ${this.trendSpikes.length} trend spikes from NETRA dataset`);
    } catch (err) {
      console.error('❌ Failed to load fixture data:', err);
    }
  }

  // ── Posts ───────────────────────────────────────────────────────────
  getPosts(filters: {
    language?: string;
    platform?: string;
    geo_location?: string;
    keyword?: string;
    threat_category?: string;
    page?: number;
    size?: number;
  } = {}): { data: Post[]; total: number; page: number; size: number } {
    let results = [...this.posts];

    if (filters.language) {
      results = results.filter(p => p.detected_language === filters.language);
    }
    if (filters.platform) {
      results = results.filter(p => p.platform.toLowerCase() === filters.platform!.toLowerCase());
    }
    if (filters.geo_location) {
      results = results.filter(p =>
        p.geo_location?.city.toLowerCase().includes(filters.geo_location!.toLowerCase())
      );
    }
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      results = results.filter(p =>
        p.text.toLowerCase().includes(kw) ||
        p.classification.keywords.some(k => k.toLowerCase().includes(kw))
      );
    }
    if (filters.threat_category) {
      const cats = filters.threat_category.split(',');
      results = results.filter(p => cats.includes(p.classification.threat_category));
    }

    // Sort by timestamp descending
    results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const total = results.length;
    const page = filters.page || 1;
    const size = filters.size || 10;
    const start = (page - 1) * size;
    const paged = results.slice(start, start + size);

    return { data: paged, total, page, size };
  }

  getPostsByIds(ids: string[]): Post[] {
    return this.posts.filter(p => ids.includes(p.post_id));
  }

  // Add new posts to the store (used by live data fetcher)
  addPosts(newPosts: any[]): void {
    const existingIds = new Set(this.posts.map(p => p.post_id));
    for (const post of newPosts) {
      if (!existingIds.has(post.post_id)) {
        this.posts.unshift(post); // Add to beginning (newest first)
        existingIds.add(post.post_id);
      }
    }
    console.log(`📥 Data store now has ${this.posts.length} total posts`);
  }

  // Add new alerts to the store (used by live data fetcher)
  addAlerts(newAlerts: Alert[]): void {
    const existingIds = new Set(this.alerts.map(a => a.alert_id));
    for (const alert of newAlerts) {
      if (!existingIds.has(alert.alert_id)) {
        this.alerts.unshift(alert); // newest first
        existingIds.add(alert.alert_id);
      }
    }
    console.log(`📥 Data store now has ${this.alerts.length} total alerts`);
  }

  // Add new trend spikes to the store
  addTrendSpikes(newSpikes: TrendSpike[]): void {
    const existingIds = new Set(this.trendSpikes.map(ts => ts.spike_id));
    for (const spike of newSpikes) {
      if (!existingIds.has(spike.spike_id)) {
        this.trendSpikes.unshift(spike);
        existingIds.add(spike.spike_id);
      }
    }
    console.log(`📥 Data store now has ${this.trendSpikes.length} total trend spikes`);
  }

  // ── Alerts ─────────────────────────────────────────────────────────
  getAlerts(severity?: number): Alert[] {
    let results = [...this.alerts];
    if (severity) {
      results = results.filter(a => a.severity >= severity);
    }
    return results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  acknowledgeAlert(alertId: string, user: string): Alert | null {
    const alert = this.alerts.find(a => a.alert_id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledged_by = user;
      alert.acknowledged_at = new Date().toISOString();
    }
    return alert || null;
  }

  unacknowledgeAlert(alertId: string): Alert | null {
    const alert = this.alerts.find(a => a.alert_id === alertId);
    if (alert) {
      alert.acknowledged = false;
      alert.acknowledged_by = undefined;
      alert.acknowledged_at = undefined;
    }
    return alert || null;
  }

  // ── Trends ─────────────────────────────────────────────────────────
  getTrendSpikes(): TrendSpike[] {
    return [...this.trendSpikes].sort((a, b) => b.z_score - a.z_score);
  }
}

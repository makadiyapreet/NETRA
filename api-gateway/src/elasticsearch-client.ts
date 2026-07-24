/**
 * Elasticsearch client for the API Gateway.
 *
 * Indexes classified posts, alerts, and trend spikes for full-text search
 * and filtered querying (language, geo, keyword, threat_category).
 *
 * When Elasticsearch is unavailable, all operations are no-ops with warnings.
 */

import { Client } from '@elastic/elasticsearch';

// ── Index Names ──────────────────────────────────────────────────────────

const INDEX_CLASSIFIED_POSTS = 'netra-classified-posts';
const INDEX_ALERTS = 'netra-alerts';
const INDEX_TREND_SPIKES = 'netra-trend-spikes';

// ── Interfaces ───────────────────────────────────────────────────────────

interface SearchFilters {
  language?: string;
  geo_location?: string;
  keyword?: string;
  threat_category?: string;
  page?: number;
  size?: number;
}

interface SearchResult<T> {
  data: T[];
  total: number;
  page: number;
  size: number;
}

// ── Client Class ─────────────────────────────────────────────────────────

export class ElasticsearchClient {
  private client: Client;
  private connected = false;

  constructor(node: string = 'http://localhost:9200') {
    this.client = new Client({
      node,
      requestTimeout: 5000,
      maxRetries: 3,
    });
  }

  /**
   * Initialize indices with proper mappings.
   */
  async init(): Promise<void> {
    try {
      await this.client.ping();
      this.connected = true;
      console.log('🔍 Elasticsearch connected');

      // Create indices if they don't exist
      await this.ensureIndex(INDEX_CLASSIFIED_POSTS, {
        post_id: { type: 'keyword' },
        threat_category: { type: 'keyword' },
        threat_confidence: { type: 'float' },
        sentiment: { type: 'keyword' },
        sentiment_intensity: { type: 'float' },
        detected_language: { type: 'keyword' },
        model_version: { type: 'keyword' },
        classified_at: { type: 'date' },
        // Joined post data (enriched at index time if available)
        text: { type: 'text', analyzer: 'standard' },
        platform: { type: 'keyword' },
        author_handle: { type: 'keyword' },
        geo_city: { type: 'keyword' },
        geo_location: { type: 'geo_point' },
        hashtags: { type: 'keyword' },
      });

      await this.ensureIndex(INDEX_ALERTS, {
        alert_id: { type: 'keyword' },
        post_id: { type: 'keyword' },
        threat_category: { type: 'keyword' },
        severity: { type: 'integer' },
        triggering_reason: { type: 'text' },
        bot_cluster_id: { type: 'keyword' },
        created_at: { type: 'date' },
        acknowledged: { type: 'boolean' },
      });

      await this.ensureIndex(INDEX_TREND_SPIKES, {
        keyword: { type: 'keyword' },
        geo_area: { type: 'keyword' },
        current_frequency: { type: 'integer' },
        z_score: { type: 'float' },
        detected_at: { type: 'date' },
        severity_hint: { type: 'integer' },
      });

      console.log('🔍 Elasticsearch indices initialized');
    } catch (err) {
      console.warn('⚠️ Elasticsearch not available — running without search indexing:', (err as Error).message);
      this.connected = false;
    }
  }

  /**
   * Create an index with mappings if it doesn't exist.
   */
  private async ensureIndex(index: string, properties: Record<string, any>): Promise<void> {
    const exists = await this.client.indices.exists({ index });
    if (!exists) {
      await this.client.indices.create({
        index,
        body: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
          },
          mappings: { properties },
        },
      });
      console.log(`  ✓ Created index: ${index}`);
    }
  }

  /**
   * Check if Elasticsearch is available.
   */
  isConnected(): boolean {
    return this.connected;
  }

  // ── Indexing Methods ─────────────────────────────────────────────────

  async indexClassifiedPost(post: any): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.index({
        index: INDEX_CLASSIFIED_POSTS,
        id: post.post_id,
        body: post,
        refresh: 'wait_for',
      });
    } catch (err) {
      console.error('ES index error (classified-post):', (err as Error).message);
    }
  }

  async indexAlert(alert: any): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.index({
        index: INDEX_ALERTS,
        id: alert.alert_id,
        body: { ...alert, acknowledged: false },
        refresh: 'wait_for',
      });
    } catch (err) {
      console.error('ES index error (alert):', (err as Error).message);
    }
  }

  async indexTrendSpike(spike: any): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.index({
        index: INDEX_TREND_SPIKES,
        body: spike,
        refresh: 'wait_for',
      });
    } catch (err) {
      console.error('ES index error (trend-spike):', (err as Error).message);
    }
  }

  // ── Query Methods ────────────────────────────────────────────────────

  /**
   * Search classified posts with filters and pagination.
   */
  async searchClassifiedPosts(filters: SearchFilters): Promise<SearchResult<any>> {
    if (!this.connected) {
      return { data: [], total: 0, page: filters.page || 1, size: filters.size || 10 };
    }

    const must: any[] = [];

    if (filters.language) {
      must.push({ term: { detected_language: filters.language } });
    }
    if (filters.threat_category) {
      const cats = filters.threat_category.split(',');
      must.push({ terms: { threat_category: cats } });
    }
    if (filters.keyword) {
      must.push({
        multi_match: {
          query: filters.keyword,
          fields: ['text', 'hashtags'],
          type: 'best_fields',
        },
      });
    }
    if (filters.geo_location) {
      must.push({
        match: { geo_city: { query: filters.geo_location, fuzziness: 'AUTO' } },
      });
    }

    const page = filters.page || 1;
    const size = filters.size || 10;
    const from = (page - 1) * size;

    try {
      const result = await this.client.search({
        index: INDEX_CLASSIFIED_POSTS,
        body: {
          query: must.length > 0 ? { bool: { must } } : { match_all: {} },
          sort: [{ classified_at: { order: 'desc' } }],
          from,
          size,
        },
      });

      const hits = result.hits.hits.map((hit: any) => hit._source);
      const total = typeof result.hits.total === 'number'
        ? result.hits.total
        : result.hits.total?.value || 0;

      return { data: hits, total, page, size };
    } catch (err) {
      console.error('ES search error:', (err as Error).message);
      return { data: [], total: 0, page, size };
    }
  }

  /**
   * Search alerts with severity filter.
   */
  async searchAlerts(minSeverity?: number): Promise<any[]> {
    if (!this.connected) return [];

    const must: any[] = [];
    if (minSeverity) {
      must.push({ range: { severity: { gte: minSeverity } } });
    }

    try {
      const result = await this.client.search({
        index: INDEX_ALERTS,
        body: {
          query: must.length > 0 ? { bool: { must } } : { match_all: {} },
          sort: [{ created_at: { order: 'desc' } }],
          size: 200,
        },
      });

      return result.hits.hits.map((hit: any) => hit._source);
    } catch (err) {
      console.error('ES alert search error:', (err as Error).message);
      return [];
    }
  }

  // ── Data Retention / Purge ───────────────────────────────────────────

  /**
   * Purge data older than the specified number of days.
   * Configurable data-retention setting per PS requirements.
   */
  async purgeOldData(retentionDays: number = 90): Promise<void> {
    if (!this.connected) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const indices = [INDEX_CLASSIFIED_POSTS, INDEX_ALERTS, INDEX_TREND_SPIKES];
    const dateFields: Record<string, string> = {
      [INDEX_CLASSIFIED_POSTS]: 'classified_at',
      [INDEX_ALERTS]: 'created_at',
      [INDEX_TREND_SPIKES]: 'detected_at',
    };

    for (const index of indices) {
      try {
        const result = await this.client.deleteByQuery({
          index,
          body: {
            query: {
              range: {
                [dateFields[index]]: { lt: cutoff.toISOString() },
              },
            },
          },
        });
        console.log(`🧹 Purged ${result.deleted} old documents from ${index}`);
      } catch (err) {
        console.error(`Purge error for ${index}:`, (err as Error).message);
      }
    }
  }
}

/**
 * Create and initialize an Elasticsearch client.
 */
export async function createElasticsearchClient(): Promise<ElasticsearchClient> {
  const node = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
  const client = new ElasticsearchClient(node);
  await client.init();
  return client;
}

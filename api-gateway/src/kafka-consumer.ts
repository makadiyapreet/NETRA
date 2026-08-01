/**
 * Kafka consumer for the API Gateway.
 *
 * MODE=fixture  → reads from fixtures/mock_data.json (default, standalone demo)
 * MODE=kafka    → consumes from live Kafka topics:
 *                   - classified-posts  (NLP Engine → Dashboard)
 *                   - alerts            (NLP/Network → Dashboard)
 *                   - trend-spikes      (Ingestion → Dashboard)
 *
 * Indexes consumed data into Elasticsearch (when available) and pushes
 * live alerts through Socket.IO to connected dashboard clients.
 */

import { Kafka, Consumer, EachMessagePayload, logLevel } from 'kafkajs';
import { Server as SocketIOServer } from 'socket.io';
import { ElasticsearchClient } from './elasticsearch-client';
import { DataStore } from './data-store';

// ── Kafka Topic Names (fixed by shared contract) ─────────────────────────

const TOPIC_CLASSIFIED_POSTS = 'classified-posts';
const TOPIC_ALERTS = 'alerts';
const TOPIC_TREND_SPIKES = 'trend-spikes';

// ── Interfaces matching shared schemas ───────────────────────────────────

interface ClassifiedPost {
  post_id: string;
  threat_category: 'Inflammatory' | 'IncitementToViolence' | 'FakeNews' | 'Neutral';
  threat_confidence: number;
  sentiment: 'positive' | 'negative' | 'neutral';
  sentiment_intensity: number;
  detected_language: 'gu' | 'hi' | 'en' | 'mixed';
  model_version: string;
  classified_at: string;
}

interface Alert {
  alert_id: string;
  post_id: string;
  threat_category: string;
  severity: number;
  triggering_reason: string;
  bot_cluster_id: string | null;
  created_at: string;
}

interface TrendSpike {
  keyword: string;
  geo_area: string;
  current_frequency: number;
  z_score: number;
  detected_at: string;
  severity_hint: number;
}

// ── In-memory stores for Kafka-consumed data ─────────────────────────────

let classifiedPosts: ClassifiedPost[] = [];
let liveAlerts: Alert[] = [];
let liveSpikes: TrendSpike[] = [];

export function getClassifiedPosts(): ClassifiedPost[] {
  return [...classifiedPosts];
}

export function getLiveAlerts(): Alert[] {
  return [...liveAlerts].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function getLiveSpikes(): TrendSpike[] {
  return [...liveSpikes].sort((a, b) => b.z_score - a.z_score);
}

// ── Kafka Consumer Class ─────────────────────────────────────────────────

export class KafkaConsumerService {
  private kafka: Kafka;
  private consumer: Consumer;
  private io: SocketIOServer | null = null;
  private esClient: ElasticsearchClient | null = null;
  private running = false;

  constructor(
    brokers: string[] = ['localhost:9092'],
    groupId: string = 'api-gateway-group'
  ) {
    this.kafka = new Kafka({
      clientId: 'netra-api-gateway',
      brokers,
      logLevel: logLevel.WARN,
      retry: {
        initialRetryTime: 1000,
        retries: 10,
      },
    });

    this.consumer = this.kafka.consumer({ groupId });
  }

  /**
   * Set the Socket.IO server instance for live push.
   */
  setSocketIO(io: SocketIOServer): void {
    this.io = io;
  }

  /**
   * Set the Elasticsearch client for indexing.
   */
  setElasticsearch(esClient: ElasticsearchClient): void {
    this.esClient = esClient;
  }

  /**
   * Start consuming from all three Kafka topics.
   */
  async start(): Promise<void> {
    if (this.running) return;

    try {
      await this.consumer.connect();
      console.log('📡 Kafka consumer connected');

      await this.consumer.subscribe({
        topics: [TOPIC_CLASSIFIED_POSTS, TOPIC_ALERTS, TOPIC_TREND_SPIKES],
        fromBeginning: false,
      });

      this.running = true;

      await this.consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.handleMessage(payload);
        },
      });

      console.log(
        `📡 Kafka consumer started — subscribed to: ${TOPIC_CLASSIFIED_POSTS}, ${TOPIC_ALERTS}, ${TOPIC_TREND_SPIKES}`
      );
    } catch (err) {
      console.error('❌ Kafka consumer failed to start:', err);
      this.running = false;
    }
  }

  /**
   * Stop the consumer gracefully.
   */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    await this.consumer.disconnect();
    console.log('📡 Kafka consumer disconnected');
  }

  /**
   * Route incoming messages to the appropriate handler.
   */
  private async handleMessage({ topic, message }: EachMessagePayload): Promise<void> {
    if (!message.value) return;

    try {
      const data = JSON.parse(message.value.toString());

      switch (topic) {
        case TOPIC_CLASSIFIED_POSTS:
          await this.handleClassifiedPost(data as ClassifiedPost);
          break;

        case TOPIC_ALERTS:
          await this.handleAlert(data as Alert);
          break;

        case TOPIC_TREND_SPIKES:
          await this.handleTrendSpike(data as TrendSpike);
          break;

        default:
          console.warn(`⚠️ Unknown topic: ${topic}`);
      }
    } catch (err) {
      console.error(`❌ Error processing message from ${topic}:`, err);
    }
  }

  /**
   * Handle a classified post: store in memory, index in ES.
   */
  private async handleClassifiedPost(post: ClassifiedPost): Promise<void> {
    // Keep last 10,000 in memory
    classifiedPosts.push(post);
    if (classifiedPosts.length > 10000) {
      classifiedPosts = classifiedPosts.slice(-10000);
    }

    // Index in Elasticsearch
    if (this.esClient) {
      try {
        await this.esClient.indexClassifiedPost(post);
      } catch (err) {
        console.error('ES indexing error:', err);
      }
    }

    // Push to connected dashboards
    if (this.io) {
      this.io.emit('classified-post', post);
    }
  }

  /**
   * Handle an alert: store in memory, push via WebSocket.
   */
  private async handleAlert(alert: Alert): Promise<void> {
    // Keep last 5,000 alerts
    liveAlerts.push(alert);
    if (liveAlerts.length > 5000) {
      liveAlerts = liveAlerts.slice(-5000);
    }

    // Index in Elasticsearch
    if (this.esClient) {
      try {
        await this.esClient.indexAlert(alert);
      } catch (err) {
        console.error('ES alert indexing error:', err);
      }
    }

    // Push live to all connected dashboard clients
    if (this.io) {
      this.io.emit('new-alert', {
        alert_id: alert.alert_id,
        type: alert.threat_category,
        severity: alert.severity,
        title: `${alert.threat_category} Alert (Severity ${alert.severity})`,
        description: alert.triggering_reason,
        related_post_ids: [alert.post_id],
        timestamp: alert.created_at,
        acknowledged: false,
      });
      console.log(
        `📢 Pushed alert ${alert.alert_id} [severity=${alert.severity}] via WebSocket`
      );
    }
  }

  /**
   * Handle a trend spike: store in memory, push via WebSocket.
   */
  private async handleTrendSpike(spike: TrendSpike): Promise<void> {
    // Keep last 1,000 spikes
    liveSpikes.push(spike);
    if (liveSpikes.length > 1000) {
      liveSpikes = liveSpikes.slice(-1000);
    }

    // Index in Elasticsearch
    if (this.esClient) {
      try {
        await this.esClient.indexTrendSpike(spike);
      } catch (err) {
        console.error('ES spike indexing error:', err);
      }
    }

    // Push to connected dashboards
    if (this.io) {
      this.io.emit('trend-spike', {
        spike_id: `spike-${Date.now()}`,
        keyword: spike.keyword,
        z_score: spike.z_score,
        detected_at: spike.detected_at,
        geo_area: spike.geo_area,
        frequency: spike.current_frequency,
      });
    }
  }
}

/**
 * Initialize the Kafka consumer based on MODE environment variable.
 *
 * MODE=fixture → no-op (DataStore handles fixture data)
 * MODE=kafka   → start consuming from live Kafka topics
 */
export async function initKafkaConsumer(
  io: SocketIOServer,
  esClient?: ElasticsearchClient
): Promise<KafkaConsumerService | null> {
  const mode = process.env.MODE || 'offline';

  if (mode !== 'kafka') {
    console.log(`📦 MODE=${mode} — Kafka consumer not started (no Docker infrastructure needed)`);
    return null;
  }

  const brokers = (process.env.KAFKA_BOOTSTRAP_SERVERS || 'localhost:9092').split(',');
  const groupId = process.env.KAFKA_GROUP_ID || 'api-gateway-group';

  const service = new KafkaConsumerService(brokers, groupId);
  service.setSocketIO(io);

  if (esClient) {
    service.setElasticsearch(esClient);
  }

  // Start consuming — don't await (runs in background)
  service.start().catch((err) => {
    console.error('❌ Kafka consumer startup failed:', err);
  });

  return service;
}

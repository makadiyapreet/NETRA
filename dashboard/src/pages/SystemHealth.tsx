import { useState, useEffect } from 'react';

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'warning' | 'down';
  port: number;
  description: string;
}

const SERVICES: ServiceStatus[] = [
  { name: 'API Gateway', status: 'healthy', port: 4000, description: 'Node.js Express + Socket.IO REST/WS API' },
  { name: 'NLP Engine', status: 'healthy', port: 8000, description: 'FastAPI IndicBERT / MuRIL Threat Classifier' },
  { name: 'Network Service', status: 'healthy', port: 8001, description: 'FastAPI Bot Detection & Neo4j Cluster Engine' },
  { name: 'Watchlist REST API', status: 'healthy', port: 8002, description: 'FastAPI PostgreSQL Watchlist Management' },
  { name: 'Apache Kafka', status: 'healthy', port: 9092, description: 'Confluent Kafka Streaming Broker' },
  { name: 'Elasticsearch', status: 'healthy', port: 9200, description: 'Search & Post Indexing Cluster' },
  { name: 'Neo4j Graph DB', status: 'healthy', port: 7474, description: 'Community Graph & Louvain Detection' },
  { name: 'Redis Cache', status: 'healthy', port: 6379, description: 'Deduplication & Rate Limit Store' },
  { name: 'PostgreSQL DB', status: 'healthy', port: 5432, description: 'Watchlist & User Account Store' },
  { name: 'Kibana Dashboard', status: 'healthy', port: 5601, description: 'Elasticsearch Visualization & Analytics' },
  { name: 'Prometheus', status: 'healthy', port: 9090, description: 'Metrics Scraper & Alerting Engine' },
  { name: 'Grafana Monitoring', status: 'healthy', port: 3001, description: '7 Provisioned Performance Dashboards' },
];

export default function SystemHealth() {
  const [metrics, setMetrics] = useState({
    ingestionRate: 42.5,
    consumerLagMs: 12,
    classificationLatencyMs: 18.4,
    networkLatencyMs: 8.2,
  });

  return (
    <div className="system-health-page">
      <div className="health-metrics-summary">
        <div className="summary-card">
          <span className="summary-label">Ingestion Rate</span>
          <span className="summary-val">{metrics.ingestionRate} msg/s</span>
          <span className="summary-sub">Across 4 platforms</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Kafka Consumer Lag</span>
          <span className="summary-val">{metrics.consumerLagMs} ms</span>
          <span className="summary-sub">Near-real-time streaming</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">NLP Latency</span>
          <span className="summary-val">{metrics.classificationLatencyMs} ms</span>
          <span className="summary-sub">Batch size 16</span>
        </div>
        <div className="summary-card">
          <span className="summary-label">Graph Query Latency</span>
          <span className="summary-val">{metrics.networkLatencyMs} ms</span>
          <span className="summary-sub">Neo4j Bolt driver</span>
        </div>
      </div>

      <div className="services-grid">
        <h3>12 Container Services Stack Status</h3>
        <div className="services-list">
          {SERVICES.map((svc) => (
            <div key={svc.name} className="service-status-card">
              <div className="service-status-header">
                <span className="service-dot healthy"></span>
                <span className="service-name">{svc.name}</span>
                <span className="service-port">:{svc.port}</span>
              </div>
              <p className="service-desc">{svc.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

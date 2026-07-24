import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Globe, MapPin, AlertTriangle } from 'lucide-react';

// Fix default marker icon issue in React-Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

type ThreatCategory = 'IncitementToViolence' | 'Inflammatory' | 'FakeNews' | 'Neutral';

const threatColors: Record<ThreatCategory, string> = {
  IncitementToViolence: '#ef4444',
  Inflammatory: '#f97316',
  FakeNews: '#a855f7',
  Neutral: '#22c55e',
};

function createThreatIcon(category: ThreatCategory) {
  const color = threatColors[category] || '#00d4ff';
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width: 28px; height: 28px; border-radius: 50%;
      background: ${color}; border: 3px solid rgba(255,255,255,0.9);
      box-shadow: 0 0 12px ${color}88, 0 2px 6px rgba(0,0,0,0.4);
      display: flex; align-items: center; justify-content: center;
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

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
    threat_category: ThreatCategory;
    sentiment: string;
    confidence: number;
    keywords: string[];
  };
}

export default function GeoMapView() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  useEffect(() => {
    fetchPosts();
  }, []);

  async function fetchPosts() {
    try {
      const res = await fetch('/api/posts?size=100');
      const data = await res.json();
      setPosts(data.data);
    } catch (err) {
      console.error('Failed to fetch posts:', err);
    } finally {
      setLoading(false);
    }
  }

  const geoPosts = posts.filter((p) => p.geo_location);
  const filteredPosts = selectedCategory
    ? geoPosts.filter((p) => p.classification.threat_category === selectedCategory)
    : geoPosts;

  // City aggregation for stats
  const cityStats = geoPosts.reduce<Record<string, { total: number; threats: number }>>((acc, p) => {
    const city = p.geo_location!.city;
    if (!acc[city]) acc[city] = { total: 0, threats: 0 };
    acc[city].total++;
    if (p.classification.threat_category !== 'Neutral') acc[city].threats++;
    return acc;
  }, {});

  const topCities = Object.entries(cityStats)
    .sort((a, b) => b[1].threats - a[1].threats)
    .slice(0, 5);

  return (
    <div className="animate-fade">
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <Globe size={22} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />
            Geo Intelligence Map
          </h2>
          <p className="page-subtitle">
            {filteredPosts.length} geo-tagged posts · {Object.keys(cityStats).length} cities
          </p>
        </div>
        <select
          className="filter-select"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          style={{ minWidth: 200 }}
        >
          <option value="">All Categories</option>
          <option value="IncitementToViolence">Incitement to Violence</option>
          <option value="Inflammatory">Inflammatory</option>
          <option value="FakeNews">Fake News</option>
          <option value="Neutral">Neutral</option>
        </select>
      </div>

      <div className="stats-row" style={{ marginBottom: 16 }}>
        {topCities.map(([city, stats]) => (
          <div key={city} className="glass-card stat-card">
            <div className="stat-card-label">
              <MapPin size={12} style={{ display: 'inline', verticalAlign: 'middle' }} /> {city}
            </div>
            <div className="stat-card-value">{stats.total}</div>
            <div className="stat-card-sub">
              {stats.threats > 0 && (
                <span style={{ color: 'var(--accent-red)' }}>
                  <AlertTriangle size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> {stats.threats} threats
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        {Object.entries(threatColors).map(([cat, color]) => (
          <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: color }} />
            {cat.replace(/([A-Z])/g, ' $1').trim()}
          </div>
        ))}
      </div>

      <div className="map-container">
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
            <div className="animate-pulse">Loading map data...</div>
          </div>
        ) : (
          <MapContainer
            center={[22.5, 78.0]}
            zoom={5}
            style={{ height: '100%', width: '100%', background: '#0a0a1a' }}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
            />
            {filteredPosts.map((post) => (
              <Marker
                key={post.post_id}
                position={[post.geo_location!.lat, post.geo_location!.lng]}
                icon={createThreatIcon(post.classification.threat_category)}
              >
                <Popup>
                  <div style={{ background: '#1a1a2e', color: '#e8eaf0', padding: '10px 14px', borderRadius: 8, minWidth: 240, maxWidth: 300, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontWeight: 700 }}>{post.author_handle}</span>
                      <span className={`badge badge-${post.classification.threat_category.toLowerCase()}`} style={{ fontSize: 9 }}>
                        {post.classification.threat_category}
                      </span>
                    </div>
                    <p style={{ lineHeight: 1.5, marginBottom: 8, color: '#b8bcc8' }}>
                      {post.text.length > 120 ? post.text.slice(0, 120) + '...' : post.text}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8b8fa3' }}>
                      <span>{post.platform} · {post.geo_location!.city}</span>
                      <span>Conf: {(post.classification.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>
    </div>
  );
}

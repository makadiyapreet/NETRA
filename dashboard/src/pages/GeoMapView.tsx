import { useState, useEffect, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import { Globe, MapPin, AlertTriangle, ExternalLink, ChevronRight } from 'lucide-react';
import { useTheme } from '../ThemeContext';
import FilterBar from '../components/FilterBar';

// Fix default marker icon issue in React-Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

type ThreatCategory = 'IncitementToViolence' | 'Inflammatory' | 'FakeNews' | 'Neutral';

const threatColors: Record<ThreatCategory | string, string> = {
  IncitementToViolence: '#ef4444',
  Inflammatory: '#f97316',
  FakeNews: '#a855f7',
  Neutral: '#22c55e',
};

function createThreatIcon(category: ThreatCategory | string) {
  const color = threatColors[category] || '#00d4ff';
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width: 28px; height: 28px; border-radius: 50%;
      background: ${color}; border: 3px solid rgba(255,255,255,0.9);
      box-shadow: 0 0 14px ${color}aa, 0 2px 8px rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
  });
}

function MapController({ center, zoom, bounds }: { center: [number, number]; zoom: number; bounds: [[number, number], [number, number]] | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.flyToBounds(bounds, { duration: 1.2, padding: [50, 50], maxZoom: 13 });
    } else {
      map.flyTo(center, zoom, { duration: 1.2 });
    }
  }, [center, zoom, bounds, map]);
  return null;
}

function ZoomTracker({ onZoomChange }: { onZoomChange: (zoom: number) => void }) {
  const map = useMapEvents({
    zoomend() {
      onZoomChange(map.getZoom());
    },
  });
  return null;
}

function createClusterIcon(count: number, level: string, name: string) {
  let size = 45;
  let bgColor = 'rgba(0, 212, 255, 0.6)';
  let outerColor = 'rgba(0, 212, 255, 0.3)';
  
  if (count > 50) {
    size = 55;
    bgColor = 'rgba(240, 194, 12, 0.6)';
    outerColor = 'rgba(241, 211, 87, 0.4)';
  }
  if (count > 200) {
    size = 65;
    bgColor = 'rgba(241, 128, 23, 0.6)';
    outerColor = 'rgba(253, 156, 115, 0.4)';
  }

  // Make Country bubbles distinctly larger
  if (level === 'country') {
    size += 15;
  }

  return L.divIcon({
    html: `<div style="position: relative; display: flex; flex-direction: column; align-items: center; overflow: visible;">
      <div style="background-color: ${outerColor}; border-radius: 50%; width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px); transition: all 0.3s ease;">
        <div style="background-color: ${bgColor}; border-radius: 50%; width: ${size - 14}px; height: ${size - 14}px; display: flex; align-items: center; justify-content: center; color: #111; font-weight: bold; font-family: sans-serif; font-size: 14px; box-shadow: 0 0 10px rgba(0,0,0,0.2);">
          ${count}
        </div>
      </div>
      <div style="position: absolute; top: ${size + 2}px; padding: 2px 8px; background: rgba(10,15,35,0.85); color: #fff; border-radius: 12px; font-size: 11px; font-weight: bold; white-space: nowrap; border: 1px solid rgba(0,212,255,0.4); box-shadow: 0 2px 6px rgba(0,0,0,0.5); z-index: 1000; letter-spacing: 0.5px;">
        ${name}: ${count}
      </div>
    </div>`,
    className: 'custom-cluster-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function GeoMapView() {
  const { theme } = useTheme();
  
  const [filters, setFilters] = useState({
    language: '',
    geo_location: '',
    keyword: '',
    threat_category: '',
    platform: '',
    country: '',
    state: '',
    city: '',
  });

  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<any[]>([]);
  const [level4Posts, setLevel4Posts] = useState<any[]>([]);
  const [countdown, setCountdown] = useState(10);

  // URL State Management
  const [drillLevel, setDrillLevel] = useState<'world' | 'country' | 'state' | 'city'>('world');
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');

  // Map view position state
  const [mapCenter, setMapCenter] = useState<[number, number]>([20.5937, 78.9629]);
  const [mapZoom, setMapZoom] = useState<number>(3);
  const [mapBounds, setMapBounds] = useState<[[number, number], [number, number]] | null>(null);

  // Sync URL search params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lvl = params.get('level') as any || 'world';
    setDrillLevel(lvl);
    if (params.get('country')) setSelectedCountry(params.get('country')!);
    if (params.get('state')) setSelectedState(params.get('state')!);
    if (params.get('city')) setSelectedCity(params.get('city')!);
  }, []);

  // Push state to URL when drill variables change
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set('level', drillLevel);
    if (selectedCountry) params.set('country', selectedCountry); else params.delete('country');
    if (selectedState) params.set('state', selectedState); else params.delete('state');
    if (selectedCity) params.set('city', selectedCity); else params.delete('city');
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
  }, [drillLevel, selectedCountry, selectedState, selectedCity]);

  // Fetch Hierarchy
  const fetchHierarchy = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.language) params.set('language', filters.language);
      if (filters.platform) params.set('platform', filters.platform);
      if (filters.keyword) params.set('keyword', filters.keyword);
      if (filters.threat_category) params.set('threat_category', filters.threat_category);

      // We don't pass geo_location or country/state filters to hierarchy because hierarchy 
      // is what we use TO drill down, we want to see the whole tree that matches keywords/platform.
      
      const res = await fetch(`/api/geo/hierarchy?${params.toString()}`);
      const data = await res.json();
      setNodes(data.nodes || []);
    } catch (err) {
      console.error('Failed to fetch hierarchy:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchHierarchy();
    const interval = setInterval(() => {
      fetchHierarchy(true);
      setCountdown(10);
    }, 10000);
    
    const tick = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 10));
    }, 1000);

    return () => { clearInterval(interval); clearInterval(tick); };
  }, [fetchHierarchy]);

  // Sync map center/zoom on initial load if URL has deep drill state
  useEffect(() => {
    if (nodes.length > 0) {
      if (drillLevel === 'city' && selectedCity) {
        const cNode = nodes.find(n => n.level === 'city' && n.name === selectedCity);
        if (cNode) {
          if (cNode.bounds && cNode.bounds.length === 2 && cNode.post_count > 1) setMapBounds(cNode.bounds as any);
          else { setMapBounds(null); setMapCenter([cNode.centroid.lat, cNode.centroid.lng]); setMapZoom(12); }
        }
      } else if (drillLevel === 'state' && selectedState) {
        const sNode = nodes.find(n => n.level === 'state' && n.name === selectedState);
        if (sNode) {
          if (sNode.bounds && sNode.bounds.length === 2 && sNode.post_count > 1) setMapBounds(sNode.bounds as any);
          else { setMapBounds(null); setMapCenter([sNode.centroid.lat, sNode.centroid.lng]); setMapZoom(7); }
        }
      } else if (drillLevel === 'country' && selectedCountry) {
        const cNode = nodes.find(n => n.level === 'country' && n.name === selectedCountry);
        if (cNode) {
          if (cNode.bounds && cNode.bounds.length === 2 && cNode.post_count > 1) setMapBounds(cNode.bounds as any);
          else { setMapBounds(null); setMapCenter([cNode.centroid.lat, cNode.centroid.lng]); setMapZoom(5); }
        }
      }
    }
  }, [nodes.length]); // Only run when nodes array length changes (meaning initial load or big update)

  // Fetch individual posts when drilled into a city
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (drillLevel === 'city' && selectedCity) {
      const fetchCityPosts = async (silent = false) => {
        if (!silent) setLoading(true);
        const params = new URLSearchParams();
        params.set('size', '500');
        params.set('geo_location', selectedCity);
        if (filters.language) params.set('language', filters.language);
        if (filters.platform) params.set('platform', filters.platform);
        if (filters.keyword) params.set('keyword', filters.keyword);
        if (filters.threat_category) params.set('threat_category', filters.threat_category);
        
        try {
          const res = await fetch(`/api/posts?${params.toString()}`);
          const data = await res.json();
          setLevel4Posts(data.data || []);
        } catch (e) {
          console.error(e);
        } finally {
          if (!silent) setLoading(false);
        }
      };
      
      fetchCityPosts();
      interval = setInterval(() => fetchCityPosts(true), 10000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [drillLevel, selectedCity, filters]);

  function handleFilterChange(key: string, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    
    // Sync FilterBar geo dropdowns with map drill-down
    if (key === 'country' && value) {
      setDrillLevel('country');
      setSelectedCountry(value);
      setSelectedState('');
      setSelectedCity('');
      const cNode = nodes.find(n => n.level === 'country' && n.name === value);
      if (cNode) {
        if (cNode.bounds && cNode.bounds.length === 2 && cNode.post_count > 1) setMapBounds(cNode.bounds as any);
        else { setMapBounds(null); setMapCenter([cNode.centroid.lat, cNode.centroid.lng]); setMapZoom(5); }
      }
    } else if (key === 'state' && value) {
      setDrillLevel('state');
      setSelectedState(value);
      setSelectedCity('');
      const sNode = nodes.find(n => n.level === 'state' && n.name === value);
      if (sNode) {
        if (sNode.bounds && sNode.bounds.length === 2 && sNode.post_count > 1) setMapBounds(sNode.bounds as any);
        else { setMapBounds(null); setMapCenter([sNode.centroid.lat, sNode.centroid.lng]); setMapZoom(7); }
      }
    } else if (key === 'city' && value) {
      setDrillLevel('city');
      setSelectedCity(value);
      const cNode = nodes.find(n => n.level === 'city' && n.name === value);
      if (cNode) {
        if (cNode.bounds && cNode.bounds.length === 2 && cNode.post_count > 1) setMapBounds(cNode.bounds as any);
        else { setMapBounds(null); setMapCenter([cNode.centroid.lat, cNode.centroid.lng]); setMapZoom(12); }
      }
    } else if (key === 'country' && !value) {
      // Cleared country -> reset to world
      breadcrumbJump('world');
    }
  }

  function clearFilters() {
    setFilters({ language: '', geo_location: '', keyword: '', threat_category: '', platform: '', country: '', state: '', city: '' });
    breadcrumbJump('world');
  }

  // Handle Zoom syncing - if user zooms out manually, go up the breadcrumb
  const handleZoomChange = (zoom: number) => {
    if (drillLevel === 'city' && zoom <= 9) {
      setDrillLevel('state');
      setSelectedCity('');
    } else if (drillLevel === 'state' && zoom <= 5) {
      setDrillLevel('country');
      setSelectedState('');
    } else if (drillLevel === 'country' && zoom <= 3) {
      setDrillLevel('world');
      setSelectedCountry('');
    }
  };

  const handleNodeClick = (node: any) => {
    setMapCenter([node.centroid.lat, node.centroid.lng]);
    const willUseBounds = (node.bounds && node.bounds.length === 2 && node.post_count > 1);
    
    if (willUseBounds) {
      setMapBounds(node.bounds as any);
    } else {
      setMapBounds(null);
    }

    if (node.level === 'country') {
      setDrillLevel('country');
      setSelectedCountry(node.name);
      if (!willUseBounds) setMapZoom(5);
    } else if (node.level === 'state') {
      setDrillLevel('state');
      setSelectedState(node.name);
      if (!willUseBounds) setMapZoom(7);
    } else if (node.level === 'city') {
      setDrillLevel('city');
      setSelectedCity(node.name);
      if (!willUseBounds) setMapZoom(12);
    }
  };

  const breadcrumbJump = (targetLevel: 'world' | 'country' | 'state') => {
    if (targetLevel === 'world') {
      setDrillLevel('world');
      setSelectedCountry('');
      setSelectedState('');
      setSelectedCity('');
      setMapBounds(null);
      setMapZoom(3);
      setMapCenter([20.5937, 78.9629]);
    } else if (targetLevel === 'country') {
      setDrillLevel('country');
      setSelectedState('');
      setSelectedCity('');
      // find country node to zoom back to it
      const cNode = nodes.find(n => n.level === 'country' && n.name === selectedCountry);
      if (cNode) {
        if (cNode.bounds) setMapBounds(cNode.bounds);
        else { setMapBounds(null); setMapCenter([cNode.centroid.lat, cNode.centroid.lng]); setMapZoom(5); }
      }
    } else if (targetLevel === 'state') {
      setDrillLevel('state');
      setSelectedCity('');
      const sNode = nodes.find(n => n.level === 'state' && n.name === selectedState);
      if (sNode) {
        if (sNode.bounds) setMapBounds(sNode.bounds);
        else { setMapBounds(null); setMapCenter([sNode.centroid.lat, sNode.centroid.lng]); setMapZoom(7); }
      }
    }
  };

  // Determine what nodes to show based on drillLevel
  const visibleNodes = nodes.filter(node => {
    if (drillLevel === 'world') return node.level === 'country';
    if (drillLevel === 'country') return node.level === 'state' && node.parent === selectedCountry;
    if (drillLevel === 'state') return node.level === 'city' && node.parent === selectedState;
    return false; // In city drillLevel, we show individual posts instead of nodes
  });

  const [tileType, setTileType] = useState<'dark' | 'light' | 'satellite' | 'terrain' | 'street' | 'watercolor'>('dark');
  
  const TILE_OPTIONS = {
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    terrain: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    street: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    watercolor: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
  };
  
  const currentTileUrl = TILE_OPTIONS[tileType];

  return (
    <div className="animate-fade">
      <div className="page-header" style={{ flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h2 className="page-title">
            <Globe size={22} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />
            Geo Intelligence Map
          </h2>
          <p className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Interactive Hierarchical Drill-Down View 
            <span style={{ fontSize: 12, opacity: 0.7, background: 'rgba(0,212,255,0.1)', padding: '2px 8px', borderRadius: 12, border: '1px solid rgba(0,212,255,0.3)' }}>
              Next refresh in {countdown}s
            </span>
          </p>
        </div>
        
        {/* Breadcrumb Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-tertiary)', padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <span style={{ cursor: 'pointer', fontWeight: drillLevel === 'world' ? 700 : 400, color: drillLevel === 'world' ? 'var(--accent-cyan)' : 'var(--text-secondary)' }} onClick={() => breadcrumbJump('world')}>
            World
          </span>
          {selectedCountry && (
            <>
              <ChevronRight size={14} style={{ opacity: 0.5 }} />
              <span style={{ cursor: 'pointer', fontWeight: drillLevel === 'country' ? 700 : 400, color: drillLevel === 'country' ? 'var(--accent-cyan)' : 'var(--text-secondary)' }} onClick={() => breadcrumbJump('country')}>
                {selectedCountry}
              </span>
            </>
          )}
          {selectedState && (
            <>
              <ChevronRight size={14} style={{ opacity: 0.5 }} />
              <span style={{ cursor: 'pointer', fontWeight: drillLevel === 'state' ? 700 : 400, color: drillLevel === 'state' ? 'var(--accent-cyan)' : 'var(--text-secondary)' }} onClick={() => breadcrumbJump('state')}>
                {selectedState}
              </span>
            </>
          )}
          {selectedCity && (
            <>
              <ChevronRight size={14} style={{ opacity: 0.5 }} />
              <span style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>
                {selectedCity}
              </span>
            </>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <FilterBar filters={filters} onChange={handleFilterChange} onClear={clearFilters} />
      </div>

      {/* Map Legend + Tile Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {Object.entries(threatColors).map(([cat, color]) => (
            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: color as string }} />
              {cat.replace(/([A-Z])/g, ' $1').trim()}
            </div>
          ))}
        </div>
        <div className="map-tile-selector">
          <button className={`map-tile-btn ${tileType === 'dark' ? 'active' : ''}`} onClick={() => setTileType('dark')}>Dark</button>
          <button className={`map-tile-btn ${tileType === 'light' ? 'active' : ''}`} onClick={() => setTileType('light')}>Light</button>
          <button className={`map-tile-btn ${tileType === 'satellite' ? 'active' : ''}`} onClick={() => setTileType('satellite')}>Satellite</button>
          <button className={`map-tile-btn ${tileType === 'terrain' ? 'active' : ''}`} onClick={() => setTileType('terrain')}>Terrain</button>
          <button className={`map-tile-btn ${tileType === 'street' ? 'active' : ''}`} onClick={() => setTileType('street')}>Street</button>
          <button className={`map-tile-btn ${tileType === 'watercolor' ? 'active' : ''}`} onClick={() => setTileType('watercolor')}>Voyager</button>
        </div>
      </div>

      <div className="map-container" style={{ height: 600, borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
        <MapContainer center={mapCenter} zoom={mapZoom} style={{ height: '100%', width: '100%' }}>
          <MapController center={mapCenter} zoom={mapZoom} bounds={mapBounds} />
          <ZoomTracker onZoomChange={handleZoomChange} />
          <TileLayer url={currentTileUrl} attribution="&copy; OSM" />
          
          {/* Level 1-3: Render Node Bubbles */}
          {drillLevel !== 'city' && visibleNodes.map((node, idx) => (
            <Marker
              key={`${node.level}-${node.name}-${idx}`}
              position={[node.centroid.lat, node.centroid.lng]}
              icon={createClusterIcon(node.post_count, node.level, node.name)}
              eventHandlers={{ click: () => handleNodeClick(node) }}
            />
          ))}

          {/* Level 4: Render Individual Posts using MarkerClusterGroup */}
          {drillLevel === 'city' && (
            <MarkerClusterGroup chunkedLoading>
              {level4Posts.map((post) => (
                <Marker
                  key={post.post_id}
                  position={[post.geo_location!.lat, post.geo_location!.lng]}
                  icon={createThreatIcon(post.classification?.threat_category || 'Neutral')}
                >
                  <Popup>
                    <div style={{ background: '#0a0a1a', color: '#e8eaf0', padding: '12px 16px', borderRadius: 8, minWidth: 260, maxWidth: 320, fontSize: 13, border: '1px solid rgba(0, 212, 255, 0.3)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        {post.post_url ? (
                          <a href={post.post_url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: 'var(--accent-cyan)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }} title="View Original Post">
                            {post.author_handle} <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>{post.author_handle}</span>
                        )}
                        <span className={`badge badge-${post.classification?.threat_category?.toLowerCase() || 'neutral'}`} style={{ fontSize: 10 }}>
                          {post.classification?.threat_category || 'Neutral'}
                        </span>
                      </div>
                      <p style={{ lineHeight: 1.5, marginBottom: 10, color: '#d0d4e4' }}>
                        {post.text.length > 130 ? post.text.slice(0, 130) + '...' : post.text}
                      </p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8b8fa3' }}>
                        <span>{post.platform} · {post.geo_location!.city}</span>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>
          )}
        </MapContainer>
      </div>
    </div>
  );
}

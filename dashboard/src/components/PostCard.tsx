import { Heart, Share2, MessageCircle, MapPin } from 'lucide-react';

interface PostCardProps {
  post: any;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

export default function PostCard({ post, selectable, selected, onSelect }: PostCardProps) {
  const cat = post.classification.threat_category;
  const badgeClass = `badge badge-${cat.toLowerCase()}`;
  const conf = post.classification.confidence;
  const confClass = conf >= 0.9 ? 'confidence-high' : conf >= 0.7 ? 'confidence-medium' : 'confidence-low';

  return (
    <div className="glass-card post-card">
      <div className="post-card-header">
        <div className="post-card-meta">
          {selectable && (
            <label className="checkbox-wrapper">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onSelect?.(post.post_id)}
              />
            </label>
          )}
          <span className={`platform-${post.platform.toLowerCase()}`} style={{ fontWeight: 600, fontSize: 12 }}>
            {post.platform}
          </span>
          <span className="post-card-author">{post.author_handle}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            {new Date(post.timestamp).toLocaleString()}
          </span>
        </div>
        <span className={badgeClass}>{cat}</span>
      </div>

      <p className="post-card-text">{post.text}</p>

      <div className="post-card-footer">
        <div className="post-card-stats">
          <span><Heart size={14} /> {post.engagement_counts.likes.toLocaleString()}</span>
          <span><Share2 size={14} /> {post.engagement_counts.shares.toLocaleString()}</span>
          <span><MessageCircle size={14} /> {post.engagement_counts.comments.toLocaleString()}</span>
          {post.geo_location && (
            <span><MapPin size={14} /> {post.geo_location.city}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Lang: {post.detected_language.toUpperCase()}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Conf: {(conf * 100).toFixed(0)}%
          </span>
          <div className="confidence-bar">
            <div className={`confidence-bar-fill ${confClass}`} style={{ width: `${conf * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

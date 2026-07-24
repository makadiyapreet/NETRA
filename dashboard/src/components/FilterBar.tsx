interface FilterBarProps {
  filters: {
    language: string;
    geo_location: string;
    keyword: string;
    threat_category: string;
  };
  onChange: (key: string, value: string) => void;
  onClear: () => void;
}

const languages = ['', 'en', 'hi', 'gu', 'mixed'];
const categories = ['', 'Inflammatory', 'IncitementToViolence', 'FakeNews', 'Neutral'];
const cities = ['', 'Ahmedabad', 'Delhi', 'Mumbai', 'Surat', 'Rajkot', 'Pune', 'Bengaluru', 'Kolkata', 'Hyderabad', 'Jaipur', 'Lucknow', 'Varanasi', 'Vadodara', 'Gandhinagar', 'Indore', 'Nagpur', 'Bhopal', 'Bhavnagar', 'Chennai'];

export default function FilterBar({ filters, onChange, onClear }: FilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="filter-group">
        <span className="filter-label">Search</span>
        <input
          className="filter-input"
          type="text"
          placeholder="Search posts..."
          value={filters.keyword}
          onChange={(e) => onChange('keyword', e.target.value)}
        />
      </div>
      <div className="filter-group">
        <span className="filter-label">Language</span>
        <select
          className="filter-select"
          value={filters.language}
          onChange={(e) => onChange('language', e.target.value)}
        >
          {languages.map((l) => (
            <option key={l} value={l}>{l || 'All Languages'}</option>
          ))}
        </select>
      </div>
      <div className="filter-group">
        <span className="filter-label">Location</span>
        <select
          className="filter-select"
          value={filters.geo_location}
          onChange={(e) => onChange('geo_location', e.target.value)}
        >
          {cities.map((c) => (
            <option key={c} value={c}>{c || 'All Locations'}</option>
          ))}
        </select>
      </div>
      <div className="filter-group">
        <span className="filter-label">Threat Category</span>
        <select
          className="filter-select"
          value={filters.threat_category}
          onChange={(e) => onChange('threat_category', e.target.value)}
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c || 'All Categories'}</option>
          ))}
        </select>
      </div>
      <div className="filter-group" style={{ justifyContent: 'flex-end' }}>
        <span className="filter-label">&nbsp;</span>
        <button className="btn btn-ghost btn-sm" onClick={onClear}>Clear</button>
      </div>
    </div>
  );
}

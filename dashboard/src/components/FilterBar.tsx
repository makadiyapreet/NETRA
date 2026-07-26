import { useState, useEffect } from 'react';
import { COUNTRIES_DATA, getCountryByName, getStateByName } from '../utils/geoData';

interface FilterBarProps {
  filters: {
    language: string;
    geo_location: string;
    keyword: string;
    threat_category: string;
    platform?: string;
    jurisdiction?: string;
    country?: string;
    state?: string;
    city?: string;
  };
  onChange: (key: string, value: string) => void;
  onClear: () => void;
}

const languages = [
  { code: '', label: 'All Languages' },
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'mr', label: 'Marathi' },
  { code: 'bn', label: 'Bengali' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'mixed', label: 'Code-Mixed' },
];

const categories = ['', 'Inflammatory', 'IncitementToViolence', 'FakeNews', 'Neutral'];

const platforms = [
  { value: '', label: 'All Platforms' },
  { value: 'Twitter', label: 'Twitter / X' },
  { value: 'Instagram', label: 'Instagram' },
  { value: 'Facebook', label: 'Facebook' },
  { value: 'YouTube', label: 'YouTube' },
  { value: 'Telegram', label: 'Telegram' },
];

export default function FilterBar({ filters, onChange, onClear }: FilterBarProps) {
  const [selectedCountry, setSelectedCountry] = useState(filters.country || '');
  const [selectedState, setSelectedState] = useState(filters.state || '');

  useEffect(() => {
    if (filters.country !== undefined) setSelectedCountry(filters.country);
    if (filters.state !== undefined) setSelectedState(filters.state);
  }, [filters.country, filters.state]);

  const countryObj = getCountryByName(selectedCountry);
  const availableStates = countryObj ? countryObj.states : [];

  const stateObj = getStateByName(selectedCountry, selectedState);
  const availableCities = stateObj ? stateObj.cities : [];

  const handleCountryChange = (country: string) => {
    setSelectedCountry(country);
    setSelectedState('');
    onChange('country', country);
    onChange('state', '');
    onChange('city', '');
    onChange('geo_location', '');
  };

  const handleStateChange = (state: string) => {
    setSelectedState(state);
    onChange('state', state);
    onChange('city', '');
    onChange('geo_location', state);
  };

  const handleCityChange = (city: string) => {
    onChange('city', city);
    onChange('geo_location', city);
  };

  const handleClearAll = () => {
    setSelectedCountry('');
    setSelectedState('');
    onClear();
  };

  return (
    <div className="filter-bar">
      <div className="filter-group">
        <span className="filter-label">Search Keyword</span>
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
            <option key={l.code} value={l.code}>{l.label}</option>
          ))}
        </select>
      </div>

      {/* Cascading Location Filter: Country -> State -> City */}
      <div className="filter-group">
        <span className="filter-label">Country</span>
        <select
          className="filter-select"
          value={selectedCountry}
          onChange={(e) => handleCountryChange(e.target.value)}
        >
          <option value="">All Countries</option>
          {COUNTRIES_DATA.map((c) => (
            <option key={c.code} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>

      {selectedCountry && (
        <div className="filter-group">
          <span className="filter-label">State / Region</span>
          <select
            className="filter-select"
            value={selectedState}
            onChange={(e) => handleStateChange(e.target.value)}
          >
            <option value="">All States</option>
            {availableStates.map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {selectedState && (
        <div className="filter-group">
          <span className="filter-label">City</span>
          <select
            className="filter-select"
            value={filters.city || ''}
            onChange={(e) => handleCityChange(e.target.value)}
          >
            <option value="">All Cities</option>
            {availableCities.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Platform Filter */}
      <div className="filter-group">
        <span className="filter-label">Platform</span>
        <select
          className="filter-select"
          value={filters.platform || ''}
          onChange={(e) => onChange('platform', e.target.value)}
        >
          {platforms.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
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

      <button className="clear-filters-btn" onClick={handleClearAll}>
        Clear Filters
      </button>
    </div>
  );
}

import { useState, useEffect } from 'react';

interface TourStep {
  target: string;
  title: string;
  content: string;
  page: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    target: 'Threat Dashboard',
    title: '1. Threat Dashboard',
    content: 'Live feed of social media posts analyzed in real time across Gujarati, Hindi, Hinglish, and English.',
    page: 'dashboard',
  },
  {
    target: 'Alert Center',
    title: '2. Alert Center',
    content: 'Real-time alert stream categorized by severity (SEV 1-5) with instant analyst acknowledgment controls.',
    page: 'alerts',
  },
  {
    target: 'Network Analysis',
    title: '3. Bot & Network Analysis',
    content: 'Interactive force-directed graph revealing bot coordination clusters and amplification networks.',
    page: 'network',
  },
  {
    target: 'Geo Intelligence',
    title: '4. Geo Intelligence',
    content: 'Heatmap displaying geo-tagged threat posts across cities with theme-aware Leaflet map tiles.',
    page: 'geomap',
  },
  {
    target: 'Trend Monitor',
    title: '5. Trend Monitor',
    content: 'Keyword frequency spike detection and rolling z-score monitoring for early threat prediction.',
    page: 'trends',
  },
  {
    target: 'Incident Reports',
    title: '6. Incident Reports',
    content: 'Generate executive incident reports in PDF, DOCX, or JSON with pre-filled threat escalation details.',
    page: 'reports',
  },
  {
    target: 'Search Results',
    title: '7. Global Search',
    content: 'Unified cross-entity search across posts, alerts, trend spikes, and bot coordination clusters.',
    page: 'search',
  },
  {
    target: 'Watchlist Manager',
    title: '8. Watchlist Manager',
    content: 'Admin-only management of tracked keywords, hashtags, geo-fences, and target profiles.',
    page: 'watchlist',
  },
];

interface GuidedTourProps {
  onNavigate: (page: any) => void;
  onClose: () => void;
}

export default function GuidedTour({ onNavigate, onClose }: GuidedTourProps) {
  const [stepIndex, setStepIndex] = useState(0);

  const currentStep = TOUR_STEPS[stepIndex];

  useEffect(() => {
    onNavigate(currentStep.page);
  }, [stepIndex]);

  const handleNext = () => {
    if (stepIndex < TOUR_STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    }
  };

  return (
    <div className="tour-overlay">
      <div className="tour-modal">
        <div className="tour-header">
          <span>{currentStep.title}</span>
          <button className="tour-close-btn" onClick={onClose}>×</button>
        </div>
        <div className="tour-body">
          <p>{currentStep.content}</p>
        </div>
        <div className="tour-footer">
          <span className="tour-step-count">{stepIndex + 1} of {TOUR_STEPS.length}</span>
          <div className="tour-nav-btns">
            {stepIndex > 0 && (
              <button className="tour-btn secondary" onClick={handlePrev}>Back</button>
            )}
            <button className="tour-btn primary" onClick={handleNext}>
              {stepIndex === TOUR_STEPS.length - 1 ? 'Finish Tour' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import React from 'react';

const CiyuanIcon: React.FC<{ className?: string }> = ({ className = 'h-6 w-6' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
    <path d="M15.5 7.5a6 6 0 1 0 0 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="16.5" cy="12" r="1.5" fill="currentColor" />
  </svg>
);

export default CiyuanIcon;

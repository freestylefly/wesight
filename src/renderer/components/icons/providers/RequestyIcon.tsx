import React from 'react';

const RequestyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="currentColor" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg" style={{flex: '0 0 auto', lineHeight: 1}}>
    <title>Requesty</title>
    <defs>
      <mask id="requesty-icon-cutout">
        <rect fill="#fff" height="24" width="24" />
        <path d="M7.5 7.5l3.75 3-3.75 3M12.375 14.625h3.75" fill="none" stroke="#000" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" />
      </mask>
    </defs>
    <g transform="rotate(-6 12 12)">
      <path mask="url(#requesty-icon-cutout)" d="M6 3h12.375A2.625 2.625 0 0 1 21 5.625v10.5a2.625 2.625 0 0 1-2.625 2.625H10.125L6.75 22.5v-3.75H6a2.625 2.625 0 0 1-2.625-2.625v-10.5A2.625 2.625 0 0 1 6 3z" />
    </g>
  </svg>
);

export default RequestyIcon;

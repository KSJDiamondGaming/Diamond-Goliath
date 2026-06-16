import React from 'react';

export default function OwnerPageLayout({ children }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 18,
        width: '100%',
      }}
    >
      {children}
    </div>
  );
}

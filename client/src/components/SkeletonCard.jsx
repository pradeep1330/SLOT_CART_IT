import React from 'react';

export default function SkeletonCard() {
  return (
    <div className="product-card skeleton-card">
      <div className="skeleton-box" style={{ height: '200px', borderRadius: '0' }} />
      <div className="product-card-body">
        <div className="skeleton-box" style={{ height: '14px', width: '45%', marginBottom: '0.5rem' }} />
        <div className="skeleton-box" style={{ height: '18px', width: '90%', marginBottom: '0.4rem' }} />
        <div className="skeleton-box" style={{ height: '18px', width: '65%', marginBottom: '0.8rem' }} />
        <div className="skeleton-box" style={{ height: '36px', width: '100%' }} />
      </div>
    </div>
  );
}

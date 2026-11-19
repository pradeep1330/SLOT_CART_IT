import React from 'react';
import { PackageOpen } from 'lucide-react';

export default function EmptyState({
  icon: Icon = PackageOpen,
  title = 'Nothing here yet',
  description = '',
  action = null,
}) {
  return (
    <div className="card empty-state">
      <div className="empty-icon-circle">
        <Icon size={32} />
      </div>
      <h3>{title}</h3>
      {description && <p className="text-muted">{description}</p>}
      {action && <div style={{ marginTop: '1rem' }}>{action}</div>}
    </div>
  );
}

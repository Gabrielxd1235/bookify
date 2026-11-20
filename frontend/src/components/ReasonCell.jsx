import React from 'react';
import { Icon } from './Icon.jsx';

const ICONS = { success: 'check', info: 'info', warning: 'clock', danger: 'alert', muted: 'x' };

/** "Reason" column: why a booking is in its current state (computed by the API). */
export function ReasonCell({ reason }) {
  if (!reason) return <span className="muted">—</span>;
  return <div className={`reason-cell reason-${reason.tone || 'muted'}`}>
    <strong><Icon name={ICONS[reason.tone] || 'info'} size={13}/>{reason.label}</strong>
    {reason.detail && <small>{reason.detail}</small>}
  </div>;
}

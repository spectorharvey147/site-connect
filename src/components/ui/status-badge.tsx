import React from 'react';

interface StatusBadgeProps {
  status?: string | null;
  className?: string;
}

const STATUS_COLOR_MAP: Record<string, string> = {
  pending: 'bg-orange-400 text-white',
  verified: 'bg-blue-500 text-white',
  approved: 'bg-green-600 text-white',
  rejected: 'bg-red-500 text-white',
  paid: 'bg-green-800 text-white',
  draft: 'bg-gray-400 text-white',
};

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  if (!status) return null;
  const key = String(status || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const color = STATUS_COLOR_MAP[key] || 'bg-muted text-foreground';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${color} ${className}`}>
      {status}
    </span>
  );
}

import React from 'react';

type Variant = 'high' | 'medium' | 'low' | 'fellow' | 'outlook' | 'email' | 'meeting' | 'pending' | 'approved' | 'rejected';

const styles: Record<Variant, string> = {
  high: 'bg-red-100 text-red-700 border border-red-200',
  medium: 'bg-amber-100 text-amber-700 border border-amber-200',
  low: 'bg-green-100 text-green-700 border border-green-200',
  fellow: 'bg-violet-100 text-violet-700 border border-violet-200',
  outlook: 'bg-blue-100 text-blue-700 border border-blue-200',
  email: 'bg-blue-100 text-blue-700 border border-blue-200',
  meeting: 'bg-violet-100 text-violet-700 border border-violet-200',
  pending: 'bg-amber-100 text-amber-700 border border-amber-200',
  approved: 'bg-green-100 text-green-700 border border-green-200',
  rejected: 'bg-slate-100 text-slate-500 border border-slate-200',
};

export function Badge({ variant, label }: { variant: Variant; label: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[variant]}`}>
      {label}
    </span>
  );
}

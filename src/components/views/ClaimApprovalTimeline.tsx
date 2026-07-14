import type { ComponentType } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  Clock3,
  Send,
  ShieldCheck,
  UserCheck,
  WalletCards,
  XCircle,
} from 'lucide-react';
import type { ClaimApprovalTrail } from '@/lib/claims-api';
import { cn } from '@/lib/utils';

type StageKey = 'submitted' | 'admin' | 'manager' | 'final' | 'accounts' | 'paid';
type StageState = 'complete' | 'current' | 'upcoming' | 'skipped';

interface TimelineClaim {
  date?: string;
  submittedBy?: string;
  userEmail?: string;
  status?: string;
  managerApprovalStatus?: string;
  rejectionReason?: string;
  approvalTrail?: ClaimApprovalTrail;
}

const stages: Array<{
  key: StageKey;
  label: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  background: string;
}> = [
  { key: 'submitted', label: 'Claim Submitted', icon: Send, color: 'text-orange-600', background: 'bg-orange-100 dark:bg-orange-950/50' },
  { key: 'admin', label: 'Admin Verified', icon: ShieldCheck, color: 'text-sky-600', background: 'bg-sky-100 dark:bg-sky-950/50' },
  { key: 'manager', label: 'Manager Approved', icon: UserCheck, color: 'text-indigo-600', background: 'bg-indigo-100 dark:bg-indigo-950/50' },
  { key: 'final', label: 'Super Admin Approved', icon: BadgeCheck, color: 'text-violet-600', background: 'bg-violet-100 dark:bg-violet-950/50' },
  { key: 'accounts', label: 'Accounts Verified', icon: WalletCards, color: 'text-emerald-600', background: 'bg-emerald-100 dark:bg-emerald-950/50' },
  { key: 'paid', label: 'Payment Completed', icon: CheckCircle2, color: 'text-green-700', background: 'bg-green-100 dark:bg-green-950/50' },
];

function currentStage(status?: string): StageKey | null {
  const value = String(status || '').toLowerCase();
  if (value.includes('reject') || value === 'paid' || value === 'closed') return null;
  if (value.includes('payment') || value.includes('accounts verified')) return 'paid';
  if (value.includes('accounts')) return 'accounts';
  if (value.includes('super admin') || value.includes('manager approved')) return 'final';
  if (value.includes('manager') || value.includes('admin verified')) return 'manager';
  return 'admin';
}

function formatTimestamp(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function stateLabel(state: StageState) {
  if (state === 'complete') return 'Completed';
  if (state === 'current') return 'Pending';
  if (state === 'skipped') return 'Skipped';
  return 'Upcoming';
}

export default function ClaimApprovalTimeline({ claim }: { claim: TimelineClaim }) {
  const trail = claim.approvalTrail || {};
  const activeStage = currentStage(claim.status);
  const activeIndex = stages.findIndex((stage) => stage.key === activeStage);
  const isRejected = String(claim.status || '').toLowerCase().includes('reject');

  const stageDetails = stages.map((stage, index) => {
    const stamp = stage.key === 'submitted'
      ? { name: claim.submittedBy || claim.userEmail || 'Claimant', email: claim.userEmail || '', date: claim.date || '' }
      : trail[stage.key];
    const skipped = stage.key === 'manager' && String(claim.managerApprovalStatus || '').toLowerCase() === 'skipped';
    const inferredComplete = !isRejected && activeIndex >= 0 && index < activeIndex;
    const state: StageState = skipped
      ? 'skipped'
      : stamp || inferredComplete
        ? 'complete'
        : stage.key === activeStage
          ? 'current'
          : 'upcoming';

    return { ...stage, stamp, state };
  });

  const visibleStages = isRejected
    ? stageDetails.filter((stage) => stage.key === 'submitted' || stage.stamp || stage.state === 'skipped')
    : stageDetails;

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold sm:text-base">Approval Timeline</h4>
          <p className="mt-1 text-xs text-muted-foreground">Current and completed workflow stages</p>
        </div>
        <Clock3 className="h-5 w-5 text-muted-foreground" />
      </div>

      <ol className="space-y-0">
        {visibleStages.map((stage, index) => {
          const Icon = stage.icon;
          const timestamp = formatTimestamp(stage.stamp?.date);
          return (
            <li key={stage.key} className="relative flex gap-3 pb-5 last:pb-0">
              {index < visibleStages.length - 1 && (
                <span className="absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-px bg-border" />
              )}
              <span className={cn(
                'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/70 shadow-sm dark:border-slate-800',
                stage.background,
                stage.state === 'upcoming' && 'bg-muted text-muted-foreground opacity-60',
              )}>
                <Icon className={cn('h-5 w-5', stage.color, stage.state === 'upcoming' && 'text-muted-foreground')} />
              </span>
              <div className={cn(
                'min-w-0 flex-1 rounded-lg border border-border bg-background p-3',
                stage.state === 'current' && 'border-primary/40 bg-primary/5',
                stage.state === 'upcoming' && 'opacity-65',
              )}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{stage.label}</p>
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                    stage.state === 'complete' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
                    stage.state === 'current' && 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
                    (stage.state === 'upcoming' || stage.state === 'skipped') && 'bg-muted text-muted-foreground',
                  )}>
                    {stateLabel(stage.state)}
                  </span>
                </div>
                {stage.stamp ? (
                  <div className="mt-1.5 space-y-1 text-xs text-muted-foreground">
                    <p>{stage.stamp.name}{stage.stamp.email ? ` · ${stage.stamp.email}` : ''}</p>
                    {timestamp && <p>{timestamp}</p>}
                    {stage.stamp.remarks && <p className="rounded bg-muted/60 px-2 py-1.5 text-foreground">{stage.stamp.remarks}</p>}
                  </div>
                ) : stage.state === 'complete' ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">Completed in the legacy workflow; detailed audit data is unavailable.</p>
                ) : null}
              </div>
            </li>
          );
        })}

        {isRejected && (
          <li className="relative flex gap-3">
            <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/50">
              <XCircle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/60 dark:bg-red-950/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">Claim Rejected</p>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/60 dark:text-red-300">Rejected</span>
              </div>
              {trail.rejected && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {trail.rejected.name} · {formatTimestamp(trail.rejected.date)}
                </p>
              )}
              {(trail.rejected?.remarks || claim.rejectionReason) && (
                <p className="mt-2 text-xs text-red-700 dark:text-red-300">{trail.rejected?.remarks || claim.rejectionReason}</p>
              )}
            </div>
          </li>
        )}
      </ol>
    </section>
  );
}

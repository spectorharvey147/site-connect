import {
  Building2,
  CalendarDays,
  FileText,
  Mail,
  MapPin,
  ReceiptText,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ClaimDetailsOverviewProps {
  claim: {
    claimId?: string;
    submittedBy?: string;
    userEmail?: string;
    site?: string;
    customerName?: string;
    date?: string;
    status?: string;
    amount?: number;
    submittedAmount?: number | null;
    verifiedAmount?: number | null;
    totalWithBill?: number;
    totalWithoutBill?: number;
    rejectionReason?: string;
  };
}

function money(value?: number | null) {
  return `Rs. ${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function dateLabel(value?: string) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusStyle(status?: string) {
  const value = String(status || '').toLowerCase();
  if (value.includes('reject')) return 'border-red-200 bg-red-100 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300';
  if (value === 'paid' || value === 'closed') return 'border-green-200 bg-green-100 text-green-700 dark:border-green-900 dark:bg-green-950/50 dark:text-green-300';
  if (value.includes('accounts')) return 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300';
  if (value.includes('approved') || value.includes('verified')) return 'border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300';
  return 'border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-300';
}

function DetailItem({ icon: Icon, label, value }: {
  icon: typeof FileText;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex min-w-0 gap-3 rounded-lg border border-border/70 bg-background/70 p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 break-words text-sm font-semibold text-foreground">{value || 'Not available'}</p>
      </div>
    </div>
  );
}

export default function ClaimDetailsOverview({ claim }: ClaimDetailsOverviewProps) {
  const approvedAmount = claim.verifiedAmount ?? claim.amount ?? 0;
  const submittedAmount = claim.submittedAmount ?? claim.amount ?? 0;
  const amountAdjusted = Math.abs(submittedAmount - approvedAmount) > 0.009;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b border-border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold', statusStyle(claim.status))}>
              {claim.status || 'Unknown Status'}
            </span>
            {claim.claimId && <span className="text-xs font-medium text-muted-foreground">{claim.claimId}</span>}
          </div>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Approved / Current Amount</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-primary sm:text-3xl">{money(approvedAmount)}</p>
          {amountAdjusted && <p className="mt-1 text-xs text-muted-foreground">Originally submitted: {money(submittedAmount)}</p>}
        </div>
        <span className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 sm:flex">
          <WalletCards className="h-7 w-7" />
        </span>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <ReceiptText className="h-4 w-4 text-primary" /> Claim Information
          </h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <DetailItem icon={CalendarDays} label="Submitted Date" value={dateLabel(claim.date)} />
            <DetailItem icon={MapPin} label="Project / Site" value={claim.site} />
            <DetailItem icon={Building2} label="Customer" value={claim.customerName} />
          </div>
        </div>

        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <UserRound className="h-4 w-4 text-primary" /> Employee Information
          </h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <DetailItem icon={UserRound} label="Submitted By" value={claim.submittedBy} />
            <DetailItem icon={Mail} label="Employee Email" value={claim.userEmail} />
          </div>
        </div>

        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-primary" /> Amount Breakdown
          </h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
              <p className="text-xs text-emerald-700 dark:text-emerald-300">With Bill</p>
              <p className="mt-1 text-lg font-bold text-emerald-800 dark:text-emerald-200">{money(claim.totalWithBill)}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
              <p className="text-xs text-amber-700 dark:text-amber-300">Without Bill</p>
              <p className="mt-1 text-lg font-bold text-amber-800 dark:text-amber-200">{money(claim.totalWithoutBill)}</p>
            </div>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs text-primary">Submitted Total</p>
              <p className="mt-1 text-lg font-bold text-primary">{money(submittedAmount)}</p>
            </div>
          </div>
        </div>

        {claim.rejectionReason && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
            <span className="font-semibold">Rejection reason:</span> {claim.rejectionReason}
          </div>
        )}
      </div>
    </section>
  );
}

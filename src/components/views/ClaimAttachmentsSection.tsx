import { FileText, Paperclip } from 'lucide-react';
import AttachmentPreview from '@/components/views/AttachmentPreview';

interface AttachmentClaim {
  claimId?: string;
  fileIds?: string[];
  generalFileIds?: string[];
  expenses?: Array<{
    category?: string;
    description?: string;
    attachmentIds?: string[];
  }>;
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

export default function ClaimAttachmentsSection({ claim }: { claim: AttachmentClaim }) {
  const rowFileIds = unique((claim.expenses || []).flatMap((expense) => expense.attachmentIds || []));
  const rowFileSet = new Set(rowFileIds);
  const generalFileIds = unique(
    claim.generalFileIds || (claim.fileIds || []).filter((fileId) => !rowFileSet.has(fileId)),
  );
  const allFileIds = unique([...(claim.fileIds || []), ...generalFileIds, ...rowFileIds]);
  const shown = new Set<string>(generalFileIds);
  const expenseGroups = (claim.expenses || []).map((expense, index) => {
    const fileIds = unique(expense.attachmentIds || []).filter((fileId) => !shown.has(fileId));
    fileIds.forEach((fileId) => shown.add(fileId));
    return {
      key: `expense-${index}`,
      label: expense.category || `Expense ${index + 1}`,
      description: expense.description || `Expense row ${index + 1}`,
      fileIds,
    };
  }).filter((group) => group.fileIds.length > 0);

  const groups = [
    ...(generalFileIds.length > 0 ? [{
      key: 'general',
      label: 'General Claim Attachments',
      description: 'Final supporting documents attached to the claim',
      fileIds: generalFileIds,
    }] : []),
    ...expenseGroups,
  ];

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold sm:text-base">
            <Paperclip className="h-4 w-4 text-primary" /> Attachments ({allFileIds.length})
          </h4>
          <p className="mt-1 text-xs text-muted-foreground">General documents and expense-row bills</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground">
          <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p className="text-sm">No attachments for this claim</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.key} className="rounded-lg border border-border/70 bg-muted/20 p-3 sm:p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{group.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{group.description}</p>
                </div>
                <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                  {group.fileIds.length} {group.fileIds.length === 1 ? 'file' : 'files'}
                </span>
              </div>
              <AttachmentPreview fileIds={group.fileIds} claimId={claim.claimId || ''} compact />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

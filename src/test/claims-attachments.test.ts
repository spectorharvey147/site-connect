import { describe, expect, it } from 'vitest';
import {
  assignStoredFilesToExpenseRows,
  collectVoucherFileIds,
  detectEmbeddableAttachmentFormat,
  getAttachmentStorageRoots,
  isStorageFolderEntry,
  resolveClaimAttachments,
  sha256ContentFingerprint,
} from '@/lib/claim-attachments';
import { expenseFingerprint, findDuplicateExpensePair, findFutureExpenseIndex } from '@/lib/claim-validation';
import { isActiveAssignedManagerSubmitter } from '@/lib/claim-approval-routing';

describe('resolveClaimAttachments', () => {
  it('derives a legacy temporary storage root from a saved general attachment', () => {
    expect(getAttachmentStorageRoots([
      'C-1791027724116/1791028722749-0.jpg',
      'C-1791027724116/expense-1/bill.pdf',
    ])).toEqual(['C-1791027724116']);
  });

  it('treats a storage entry without an object id as a folder even when metadata is present', () => {
    expect(isStorageFolderEntry({ id: null })).toBe(true);
    expect(isStorageFolderEntry({ id: null, metadata: { size: 0 } })).toBe(true);
    expect(isStorageFolderEntry({ id: 'object-id' })).toBe(false);
  });

  it('recovers row attachments from expense1 and expense-1 storage folders', () => {
    expect(assignStoredFilesToExpenseRows(
      [{ attachmentIds: [] }, { attachmentIds: ['claim/expense-2/saved.jpg'] }],
      [
        'claim/expense1/bill.pdf',
        'claim/expense-2/saved.jpg',
        'claim/expense_2/receipt.jpg',
        'claim/general.jpg',
      ],
    )).toEqual([
      { attachmentIds: ['claim/expense1/bill.pdf'] },
      { attachmentIds: ['claim/expense-2/saved.jpg', 'claim/expense_2/receipt.jpg'] },
    ]);
  });

  it('recovers files stored below a display claim number folder', () => {
    expect(assignStoredFilesToExpenseRows(
      [{ attachmentIds: [] }, { attachmentIds: [] }],
      ['CLM-0528/expense1/bill.pdf', 'CLM-0528/expense2/receipt.jpg'],
    )).toEqual([
      { attachmentIds: ['CLM-0528/expense1/bill.pdf'] },
      { attachmentIds: ['CLM-0528/expense2/receipt.jpg'] },
    ]);
  });

  it('combines legacy claim files and row files without duplicates', () => {
    expect(resolveClaimAttachments(
      ['claim/main.jpg', 'claim/expense-1/bill.pdf'],
      [
        { attachmentIds: ['claim/expense-1/bill.pdf', 'claim/expense-1/receipt.jpg'] },
        { attachmentIds: [] },
      ],
    )).toEqual({
      fileIds: [
        'claim/expense-1/bill.pdf',
        'claim/expense-1/receipt.jpg',
        'claim/main.jpg',
      ],
      generalFileIds: ['claim/main.jpg'],
    });
  });

  it('keeps unclassified legacy files visible as general attachments', () => {
    expect(resolveClaimAttachments(['claim/old-scan.jpg'], [])).toEqual({
      fileIds: ['claim/old-scan.jpg'],
      generalFileIds: ['claim/old-scan.jpg'],
    });
  });

  it('returns all three files for the CLM-0169 storage pattern', () => {
    expect(resolveClaimAttachments(
      ['claim/final-attachment.jpg'],
      [{ attachmentIds: ['claim/expense-1/bill-1.jpg', 'claim/expense-1/bill-2.jpg'] }],
    )).toEqual({
      fileIds: [
        'claim/expense-1/bill-1.jpg',
        'claim/expense-1/bill-2.jpg',
        'claim/final-attachment.jpg',
      ],
      generalFileIds: ['claim/final-attachment.jpg'],
    });
  });
});

describe('claim submission rules', () => {
  it('skips the manager stage only when the active assigned manager submitted the claim', () => {
    expect(isActiveAssignedManagerSubmitter({ submitterEmail: 'MANAGER@example.com', managerEmail: 'manager@example.com', managerRole: 'Manager', managerActive: true })).toBe(true);
    expect(isActiveAssignedManagerSubmitter({ submitterEmail: 'manager@example.com', managerEmail: 'other@example.com', managerRole: 'Manager', managerActive: true })).toBe(false);
    expect(isActiveAssignedManagerSubmitter({ submitterEmail: 'manager@example.com', managerEmail: 'manager@example.com', managerRole: 'Manager', managerActive: false })).toBe(false);
    expect(isActiveAssignedManagerSubmitter({ submitterEmail: 'admin@example.com', managerEmail: 'admin@example.com', managerRole: 'Super Admin', managerActive: true })).toBe(false);
  });

  it('rejects future expense dates', () => {
    expect(findFutureExpenseIndex([
      { claimDate: '2026-07-14', amountWithBill: 100, amountWithoutBill: 0 },
      { claimDate: '2026-07-15', amountWithBill: 0, amountWithoutBill: 100 },
    ], '2026-07-14')).toBe(1);
  });

  it('detects a same-date, same-category, same-project duplicate even when bill allocation differs', () => {
    expect(findDuplicateExpensePair([
      { claimDate: '2026-07-14', category: 'Fuel', projectCode: 'P-1', amountWithBill: 100, amountWithoutBill: 50 },
      { claimDate: '2026-07-14', category: ' fuel ', projectCode: 'p-1', amountWithBill: 0, amountWithoutBill: 150 },
    ])).toEqual({ firstIndex: 0, duplicateIndex: 1 });
  });

  it('allows the same amount on the same date under different categories', () => {
    expect(findDuplicateExpensePair([
      { claimDate: '2026-07-14', category: 'Fuel', amountWithBill: 1000, amountWithoutBill: 0 },
      { claimDate: '2026-07-14', category: 'Staff Welfare', amountWithBill: 1000, amountWithoutBill: 0 },
      { claimDate: '2026-07-14', category: 'Material Purchase', amountWithBill: 1000, amountWithoutBill: 0 },
    ])).toBeNull();
  });

  it('allows matching category and amount on different dates or project codes', () => {
    expect(findDuplicateExpensePair([
      { claimDate: '2026-07-13', category: 'Fuel', projectCode: 'P-1', amountWithBill: 150, amountWithoutBill: 0 },
      { claimDate: '2026-07-14', category: 'Fuel', projectCode: 'P-1', amountWithBill: 150, amountWithoutBill: 0 },
      { claimDate: '2026-07-14', category: 'Fuel', projectCode: 'P-2', amountWithBill: 150, amountWithoutBill: 0 },
    ])).toBeNull();
  });

  it('allows different amounts in the same category on the same date', () => {
    expect(findDuplicateExpensePair([
      { claimDate: '2026-07-14', category: 'Fuel', amountWithBill: 1000, amountWithoutBill: 0 },
      { claimDate: '2026-07-14', category: 'Fuel', amountWithBill: 1200, amountWithoutBill: 0 },
    ])).toBeNull();
  });

  it('normalizes category and compares amounts in integer paise', () => {
    expect(expenseFingerprint({ claimDate: '2026-07-14T10:00:00Z', category: '  FUEL ', projectCode: ' P-1 ', amountWithBill: 10.1, amountWithoutBill: 0 }))
      .toBe('2026-07-14|fuel|p-1|1010');
  });
});

describe('payment voucher attachment handling', () => {
  it('uses SHA-256 content fingerprints instead of filenames to identify identical uploads', async () => {
    const first = new Uint8Array([1, 2, 3, 4]);
    const sameContent = new Uint8Array([1, 2, 3, 4]);
    const differentContent = new Uint8Array([1, 2, 3, 5]);
    expect(await sha256ContentFingerprint(first)).toBe(await sha256ContentFingerprint(sameContent));
    expect(await sha256ContentFingerprint(first)).not.toBe(await sha256ContentFingerprint(differentContent));
  });

  it('orders row attachments before additional claim files and removes duplicate references', () => {
    expect(collectVoucherFileIds([
      { fileIds: ['claim/main.jpg', 'claim/expense-1/receipt.pdf'], expenses: [{ attachmentIds: ['claim/expense-1/receipt.pdf'] }] },
      { fileIds: ['claim/expense-1/receipt.pdf', 'claim/expense-2/receipt.jpg'], expenses: [{ attachmentIds: ['claim/expense-2/receipt.jpg'] }] },
    ])).toEqual([
      'claim/expense-1/receipt.pdf',
      'claim/main.jpg',
      'claim/expense-2/receipt.jpg',
    ]);
  });

  it('includes row-level files even when the claim-level list is incomplete', () => {
    expect(collectVoucherFileIds([{
      fileIds: ['claim/main.jpg'],
      expenses: [{ attachmentIds: ['claim/expense1/bill.pdf'] }],
    }])).toEqual(['claim/expense1/bill.pdf', 'claim/main.jpg']);
  });

  it('detects embeddable formats from file bytes instead of misleading names', () => {
    expect(detectEmbeddableAttachmentFormat(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('pdf');
    expect(detectEmbeddableAttachmentFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(detectEmbeddableAttachmentFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(detectEmbeddableAttachmentFormat(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]))).toBe('unsupported');
  });
});

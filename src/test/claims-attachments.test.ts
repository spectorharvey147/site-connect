import { describe, expect, it } from 'vitest';
import {
  assignStoredFilesToExpenseRows,
  collectVoucherFileIds,
  detectEmbeddableAttachmentFormat,
  getAttachmentStorageRoots,
  isStorageFolderEntry,
  resolveClaimAttachments,
} from '@/lib/claim-attachments';
import { findDuplicateExpensePair, findFutureExpenseIndex } from '@/lib/claim-validation';

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
        'claim/main.jpg',
        'claim/expense-1/bill.pdf',
        'claim/expense-1/receipt.jpg',
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
        'claim/final-attachment.jpg',
        'claim/expense-1/bill-1.jpg',
        'claim/expense-1/bill-2.jpg',
      ],
      generalFileIds: ['claim/final-attachment.jpg'],
    });
  });
});

describe('claim submission rules', () => {
  it('rejects future expense dates', () => {
    expect(findFutureExpenseIndex([
      { claimDate: '2026-07-14', amountWithBill: 100, amountWithoutBill: 0 },
      { claimDate: '2026-07-15', amountWithBill: 0, amountWithoutBill: 100 },
    ], '2026-07-14')).toBe(1);
  });

  it('detects the same date and total even when bill allocation differs', () => {
    expect(findDuplicateExpensePair([
      { claimDate: '2026-07-14', amountWithBill: 100, amountWithoutBill: 50 },
      { claimDate: '2026-07-14', amountWithBill: 0, amountWithoutBill: 150 },
    ])).toEqual({ firstIndex: 0, duplicateIndex: 1 });
  });

  it('allows the same amount on different dates', () => {
    expect(findDuplicateExpensePair([
      { claimDate: '2026-07-13', amountWithBill: 150, amountWithoutBill: 0 },
      { claimDate: '2026-07-14', amountWithBill: 150, amountWithoutBill: 0 },
    ])).toBeNull();
  });
});

describe('payment voucher attachment handling', () => {
  it('includes row-level files already resolved onto each claim and removes duplicates', () => {
    expect(collectVoucherFileIds([
      { fileIds: ['claim/main.jpg', 'claim/expense-1/receipt.pdf'] },
      { fileIds: ['claim/expense-1/receipt.pdf', 'claim/expense-2/receipt.jpg'] },
    ])).toEqual([
      'claim/main.jpg',
      'claim/expense-1/receipt.pdf',
      'claim/expense-2/receipt.jpg',
    ]);
  });

  it('includes row-level files even when the claim-level list is incomplete', () => {
    expect(collectVoucherFileIds([{
      fileIds: ['claim/main.jpg'],
      expenses: [{ attachmentIds: ['claim/expense1/bill.pdf'] }],
    }])).toEqual(['claim/main.jpg', 'claim/expense1/bill.pdf']);
  });

  it('detects embeddable formats from file bytes instead of misleading names', () => {
    expect(detectEmbeddableAttachmentFormat(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('pdf');
    expect(detectEmbeddableAttachmentFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(detectEmbeddableAttachmentFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(detectEmbeddableAttachmentFormat(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]))).toBe('unsupported');
  });
});

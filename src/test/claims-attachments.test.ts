import { describe, expect, it } from 'vitest';
import {
  collectVoucherFileIds,
  detectEmbeddableAttachmentFormat,
  resolveClaimAttachments,
} from '@/lib/claim-attachments';
import { findDuplicateExpensePair, findFutureExpenseIndex } from '@/lib/claim-validation';

describe('resolveClaimAttachments', () => {
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

  it('detects embeddable formats from file bytes instead of misleading names', () => {
    expect(detectEmbeddableAttachmentFormat(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('pdf');
    expect(detectEmbeddableAttachmentFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(detectEmbeddableAttachmentFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(detectEmbeddableAttachmentFormat(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]))).toBe('unsupported');
  });
});

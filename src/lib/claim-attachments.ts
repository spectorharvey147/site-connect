function uniqueFileIds(fileIds: string[]) {
  return [...new Set(fileIds.map((fileId) => String(fileId || '').trim()).filter(Boolean))];
}

export type EmbeddableAttachmentFormat = 'pdf' | 'png' | 'jpeg' | 'unsupported';

export function collectVoucherFileIds(claims: Array<{ fileIds?: string[] }> | null | undefined) {
  return uniqueFileIds((claims || []).flatMap((claim) => claim.fileIds || []));
}

export function detectEmbeddableAttachmentFormat(input: ArrayBuffer | Uint8Array): EmbeddableAttachmentFormat {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46
    && bytes[4] === 0x2d) return 'pdf';
  if (bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  return 'unsupported';
}

export function resolveClaimAttachments(
  claimFileIds: string[] | null | undefined,
  expenses: Array<{ attachmentIds?: string[] }>,
) {
  const storedClaimFileIds = uniqueFileIds(claimFileIds || []);
  const rowFileIds = uniqueFileIds(expenses.flatMap((expense) => expense.attachmentIds || []));
  const rowFileIdSet = new Set(rowFileIds);

  return {
    fileIds: uniqueFileIds([...storedClaimFileIds, ...rowFileIds]),
    generalFileIds: storedClaimFileIds.filter((fileId) => !rowFileIdSet.has(fileId)),
  };
}

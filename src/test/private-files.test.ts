import { describe, expect, it } from 'vitest';
import { attachmentLink } from '@/lib/private-files';

describe('attachmentLink', () => {
  it('uses the supplied public app URL for email links', () => {
    const link = attachmentLink(
      'C-1790305115009/1790305307607-0.jpg',
      'claim-attachments',
      'https://claims.example.com',
    );

    expect(link).toBe(
      'https://claims.example.com/attachment?bucket=claim-attachments&path=C-1790305115009%2F1790305307607-0.jpg',
    );
    expect(link).not.toContain('localhost');
  });
});

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type AttachmentIdValue = string | number | { fileId?: string; id?: string; path?: string; storagePath?: string; name?: string } | null | undefined;

function normalizeAttachmentId(value: AttachmentIdValue) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object') {
    return String(value.fileId || value.id || value.path || value.storagePath || value.name || '').trim();
  }
  return '';
}

export function normalizeAttachmentIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value
      .map((entry) => normalizeAttachmentId(entry as AttachmentIdValue))
      .filter(Boolean)
    )];
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return normalizeAttachmentIds(parsed);
      if (parsed && typeof parsed === 'object') {
        const id = normalizeAttachmentId(parsed as AttachmentIdValue);
        return id ? [id] : [];
      }
    } catch {
      // ignore parse errors and fall back to delimiter splitting
    }

    return [...new Set(trimmed
      .split(/[,;\n\r]+/)
      .map((entry) => normalizeAttachmentId(entry.trim()))
      .filter(Boolean)
    )];
  }

  if (typeof value === 'object' && value !== null) {
    const id = normalizeAttachmentId(value as AttachmentIdValue);
    return id ? [id] : [];
  }

  return [];
}

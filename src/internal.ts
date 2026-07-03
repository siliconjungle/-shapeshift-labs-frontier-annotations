import type { FrontierAnnotationJsonObject, FrontierAnnotationJsonValue } from './types.js';

export function nowMs() {
  return Date.now();
}

export function stableId(prefix: string, seed: string, now = nowMs()) {
  return prefix + '-' + fnv1a32(seed + ':' + now).toString(16).padStart(8, '0');
}

export function toJsonObject(value: unknown): FrontierAnnotationJsonObject | undefined {
  const normalized = toJsonValue(value);
  return normalized && typeof normalized === 'object' && !Array.isArray(normalized)
    ? normalized as FrontierAnnotationJsonObject
    : undefined;
}

export function toJsonValue(value: unknown, depth = 0): FrontierAnnotationJsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    if (depth > 12) return [];
    const out: FrontierAnnotationJsonValue[] = [];
    for (const item of value) {
      const normalized = toJsonValue(item, depth + 1);
      if (normalized !== undefined) out.push(normalized);
    }
    return out;
  }
  if (value && typeof value === 'object') {
    if (depth > 12) return {};
    const out: FrontierAnnotationJsonObject = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const normalized = toJsonValue(item, depth + 1);
      if (normalized !== undefined) out[key] = normalized;
    }
    return out;
  }
  return undefined;
}

export function uniqueStrings(values: Iterable<string | undefined | null>) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function clampText(text: string, maxBytes: number) {
  if (maxBytes <= 0) return '';
  let used = 0;
  let end = 0;
  for (; end < text.length; end++) {
    const code = text.charCodeAt(end);
    used += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : 3;
    if (used > maxBytes) break;
  }
  const sliced = text.slice(0, end);
  return end < text.length ? sliced.replace(/\s+$/, '') + '\n/* truncated */' : sliced;
}

export function tokenize(value: string | undefined, minLength = 2) {
  if (!value) return [];
  return uniqueStrings(
    value
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/[^A-Za-z0-9_./:-]+/g)
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length >= minLength)
  );
}

export function basename(file: string) {
  const normalized = file.replace(/\\/g, '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

export function fnv1a32(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

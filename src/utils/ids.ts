export function createId(prefix: string): string {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}:${globalThis.crypto.randomUUID()}`;
  }

  const randomSuffix = Math.random().toString(36).slice(2, 12);
  return `${prefix}:${Date.now().toString(36)}${randomSuffix}`;
}

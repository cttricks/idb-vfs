function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createContentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const contentBytes = encoder.encode(content);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", contentBytes);

  return bytesToHex(new Uint8Array(digest));
}

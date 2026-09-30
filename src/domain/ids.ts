const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

/**
 * RFC 9562 UUID v7: 48-bit Unix-ms timestamp + random bits. Time-ordered IDs keep
 * SQLite/Postgres indexes compact. Randomness is injected so this stays pure.
 */
export function uuidV7(randomBytes: Uint8Array, nowMs: number): string {
  if (randomBytes.length < 16) {
    throw new Error('uuidV7 requires 16 random bytes');
  }
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new Error('uuidV7 requires a non-negative integer timestamp');
  }

  const bytes = Uint8Array.from(randomBytes.subarray(0, 16));
  let ts = nowMs;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const h = Array.from(bytes, (b) => HEX[b]).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export type IdGenerator = () => string;

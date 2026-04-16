import { createHash, randomBytes } from "crypto";

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function normalizeValue(value: unknown): CanonicalValue {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return normalizeIsoTimestamp(value);
  if (Array.isArray(value)) return value.map((entry) => normalizeValue(entry));
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Cannot canonicalize non-finite number");
    }
    return value;
  }
  if (typeof value === "bigint") return value.toString();

  if (typeof value === "object") {
    const normalized: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      normalized[key] = normalizeValue((value as Record<string, unknown>)[key]);
    }
    return normalized;
  }

  return String(value);
}

export function canonicalizeJson(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashCanonicalJson(value: unknown): string {
  return sha256Hex(canonicalizeJson(value));
}

export function normalizeIsoTimestamp(value: string | Date): string {
  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error(`Invalid timestamp: ${String(value)}`);
  }
  return timestamp.toISOString();
}

export function buildUuidV7(now: string | Date = new Date()): string {
  const timestamp = valueToDate(now).getTime();
  const random = randomBytes(10);
  const bytes = Buffer.alloc(16);

  bytes[0] = Number((BigInt(timestamp) >> 40n) & 0xffn);
  bytes[1] = Number((BigInt(timestamp) >> 32n) & 0xffn);
  bytes[2] = Number((BigInt(timestamp) >> 24n) & 0xffn);
  bytes[3] = Number((BigInt(timestamp) >> 16n) & 0xffn);
  bytes[4] = Number((BigInt(timestamp) >> 8n) & 0xffn);
  bytes[5] = Number(BigInt(timestamp) & 0xffn);
  bytes[6] = 0x70 | (random[0] & 0x0f);
  bytes[7] = random[1];
  bytes[8] = 0x80 | (random[2] & 0x3f);
  bytes[9] = random[3];
  bytes[10] = random[4];
  bytes[11] = random[5];
  bytes[12] = random[6];
  bytes[13] = random[7];
  bytes[14] = random[8];
  bytes[15] = random[9];

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function valueToDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

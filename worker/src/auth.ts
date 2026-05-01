// auth.ts
// PIN hashing and security tokens. Pure functions over WebCrypto so they
// can run in the worker runtime without any deps.

const PIN_ITERATIONS = 100_000;
const enc = new TextEncoder();

// ─── helpers ───

function bytesToBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function timingSafeEqualU8(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ─── PIN ───

export function isValidPin(s: string): boolean {
  return typeof s === "string" && /^[0-9]{6}$/.test(s);
}

export type PinHash = {
  hash: string;       // base64url
  salt: string;       // base64url
  iterations: number;
};

/** Hash a 6-digit PIN with PBKDF2-SHA256 + 16-byte random salt. */
export async function hashPin(pin: string): Promise<PinHash> {
  if (!isValidPin(pin)) throw new Error("PIN must be 6 digits");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(pin, salt, PIN_ITERATIONS);
  return {
    hash: bytesToBase64Url(hash),
    salt: bytesToBase64Url(salt),
    iterations: PIN_ITERATIONS,
  };
}

/** Constant-time PIN check against a stored hash. */
export async function verifyPin(
  pin: string,
  stored: { hash: string; salt: string; iterations: number },
): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  const salt = base64UrlToBytes(stored.salt);
  const expected = base64UrlToBytes(stored.hash);
  const got = new Uint8Array(await pbkdf2(pin, salt, stored.iterations));
  return timingSafeEqualU8(expected, got);
}

async function pbkdf2(pin: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(pin), { name: "PBKDF2" }, false, ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
}

// ─── opaque tokens for email links ───
//
// We never store the raw token — only its SHA-256. The plaintext lives
// only in the email URL, so a DB dump can't be used to take over accounts.

/** Generate a fresh random token (32 bytes → 43 base64url chars). */
export function generateToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(token));
  return bytesToBase64Url(buf);
}

/** Constant-time check of a presented token against a stored hash. */
export async function verifyToken(token: string, storedHash: string): Promise<boolean> {
  const got = await hashToken(token);
  // Both sides are base64url ASCII strings — fixed-length safe compare.
  if (got.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ storedHash.charCodeAt(i);
  return diff === 0;
}

import "server-only";
import * as crypto from "node:crypto";

/**
 * Symmetric crypto for the Google Calendar OAuth flow.
 *
 * Two utilities:
 *   - encryptRefreshToken / decryptRefreshToken: AES-256-GCM, used to
 *     protect refresh_token at rest in google_calendar_integrations.
 *     The schema column is `refresh_token_enc`.
 *   - signOAuthState / verifyOAuthState: HMAC-SHA256 over a JSON payload,
 *     used as the OAuth `state` parameter so the callback can trust that
 *     the request came from this server and hasn't expired.
 *
 * Both reuse GCAL_TOKEN_ENCRYPTION_KEY (a 32-byte base64 string). The key
 * is generated once with `openssl rand -base64 32` and stored in
 * .env.local. Server-only by import.
 */

function getKey(): Buffer {
  const b64 = process.env.GCAL_TOKEN_ENCRYPTION_KEY;
  if (!b64) throw new Error("GCAL_TOKEN_ENCRYPTION_KEY is not set");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(
      `GCAL_TOKEN_ENCRYPTION_KEY must decode to 32 bytes; got ${key.length}`
    );
  }
  return key;
}

// ---------- AES-256-GCM ----------

/**
 * Encrypt a string with AES-256-GCM. Output format:
 *   base64(iv) ":" base64(ciphertext) ":" base64(authTag)
 *
 * iv is a fresh 12-byte random per call (NIST recommendation for GCM).
 * authTag is the GCM tag the cipher produces; verified on decrypt.
 */
export function encryptRefreshToken(plaintext: string): string {
  if (!plaintext) throw new Error("encryptRefreshToken: empty plaintext");
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    ciphertext.toString("base64"),
    authTag.toString("base64"),
  ].join(":");
}

export function decryptRefreshToken(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("decryptRefreshToken: malformed payload");
  }
  const [iv, ciphertext, authTag] = parts.map((p) => Buffer.from(p, "base64"));
  if (iv.length !== 12) {
    throw new Error(`decryptRefreshToken: bad iv length ${iv.length}`);
  }
  const key = getKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// ---------- HMAC-signed OAuth state ----------

export interface OAuthStatePayload {
  staff_id: string;
  nonce: string;
  /** Unix milliseconds. Tokens older than this are rejected. */
  expires_at: number;
}

/**
 * Sign a small JSON payload with HMAC-SHA256 (key = GCAL_TOKEN_ENCRYPTION_KEY).
 * Output: base64url(json) "." base64url(hmac).
 *
 * Reusing the encryption key as an HMAC key is acceptable here — they're
 * both 32-byte secrets controlled by the same operator (Nigel) and the
 * tokens we sign are short-lived (10 min). For a stricter setup, derive
 * a separate HMAC key with HKDF.
 */
export function signOAuthState(payload: OAuthStatePayload): string {
  const key = getKey();
  const json = JSON.stringify(payload);
  const part1 = Buffer.from(json, "utf8").toString("base64url");
  const hmac = crypto.createHmac("sha256", key).update(json).digest();
  const part2 = hmac.toString("base64url");
  return `${part1}.${part2}`;
}

export function verifyOAuthState(state: string): OAuthStatePayload | null {
  const parts = state.split(".");
  if (parts.length !== 2) return null;
  let json: string;
  try {
    json = Buffer.from(parts[0], "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expectedHmac = (() => {
    try {
      return Buffer.from(parts[1], "base64url");
    } catch {
      return null;
    }
  })();
  if (!expectedHmac) return null;
  const key = getKey();
  const computedHmac = crypto.createHmac("sha256", key).update(json).digest();
  if (
    expectedHmac.length !== computedHmac.length ||
    !crypto.timingSafeEqual(expectedHmac, computedHmac)
  ) {
    return null;
  }
  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(json);
  } catch {
    return null;
  }
  if (
    typeof payload.staff_id !== "string" ||
    typeof payload.nonce !== "string" ||
    typeof payload.expires_at !== "number"
  ) {
    return null;
  }
  if (Date.now() > payload.expires_at) return null;
  return payload;
}

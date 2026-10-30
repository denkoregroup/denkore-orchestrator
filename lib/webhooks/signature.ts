import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "x-denkore-signature";
const PREFIX = "sha256=";

export function sign(rawBody: string, secret: string): string {
  return PREFIX + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/** Constant-time check of an HMAC-SHA256 signature over the exact raw request body. */
export function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!secret || !header || !header.startsWith(PREFIX)) return false;
  const expected = Buffer.from(sign(rawBody, secret), "utf8");
  const received = Buffer.from(header, "utf8");
  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

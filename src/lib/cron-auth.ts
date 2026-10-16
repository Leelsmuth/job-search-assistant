import { timingSafeEqual } from "node:crypto";

function bearerMatches(authHeader: string, secret: string): boolean {
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(authHeader);
  const right = Buffer.from(expected);
  const length = Math.max(left.length, right.length, 1);
  const paddedLeft = Buffer.alloc(length);
  const paddedRight = Buffer.alloc(length);
  left.copy(paddedLeft);
  right.copy(paddedRight);
  return timingSafeEqual(paddedLeft, paddedRight) && left.length === right.length;
}

export function verifyCronAuth(authHeader: string | null): { ok: true } | { ok: false; status: 503 | 401; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) {
    console.error(
      "[cron] CRON_SECRET is not set. Refusing the request. Add CRON_SECRET to the Vercel project environment variables."
    );
    return { ok: false, status: 503, error: "CRON_SECRET is not set" };
  }
  if (!authHeader || !bearerMatches(authHeader, secret)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

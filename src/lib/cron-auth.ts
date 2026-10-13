export function verifyCronAuth(authHeader: string | null): { ok: true } | { ok: false; status: 503 | 401; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) {
    console.error(
      "[cron] CRON_SECRET is not set. Refusing the request. Add CRON_SECRET to the Vercel project environment variables."
    );
    return { ok: false, status: 503, error: "CRON_SECRET is not set" };
  }
  if (authHeader !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

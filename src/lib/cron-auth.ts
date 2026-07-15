export function verifyCronAuth(authHeader: string | null): { ok: true } | { ok: false; status: 503 | 401; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 503, error: "Cron not configured" };
  }
  if (authHeader !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

import { isDeliverableEmail } from "@/modules/digest/email";

export function renderInstantAlertEmail(
  jobs: Array<{ id: string; title: string; companyName: string; score: number; href: string }>,
  appBaseUrl: string
): { subject: string; html: string; text: string } {
  const base = appBaseUrl.replace(/\/$/, "");
  const count = jobs.length;
  const subject =
    count === 1 ? `New match: ${jobs[0]?.title ?? "a role"}` : `New matches: ${count} roles posted recently`;
  const text = [
    "New job alerts",
    "",
    ...jobs.flatMap((job, index) => [
      `${index + 1}. ${job.title} — ${job.companyName} (${job.score})`,
      `   ${base}${job.href}`,
    ]),
    "",
    `Alerts: ${base}/alerts`,
  ].join("\n");
  const items = jobs
    .map(
      (job) =>
        `<li style="margin:0 0 12px"><a href="${escapeHtml(base + job.href)}">${escapeHtml(job.title)}</a> — ${escapeHtml(job.companyName)} · ${escapeHtml(String(job.score))}</li>`
    )
    .join("");
  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif"><p>New job alerts</p><ol>${items}</ol><p><a href="${escapeHtml(base)}/alerts">Open alerts</a></p></body></html>`;
  return { subject, html, text };
}

export async function sendInstantAlertEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true } | { ok: false; reason: "resend_not_configured" | "send_failed" | "missing_recipient" }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.DIGEST_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    console.info("[alerts] RESEND_API_KEY or DIGEST_FROM_EMAIL is not set. Skipping email.");
    return { ok: false, reason: "resend_not_configured" };
  }
  if (!isDeliverableEmail(input.to)) {
    console.info("[alerts] auth email is missing or not deliverable. Skipping email.");
    return { ok: false, reason: "missing_recipient" };
  }
  try {
    const response = await (input.fetchImpl ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error("[alerts] Resend rejected the email", { status: response.status });
      return { ok: false, reason: "send_failed" };
    }
    return { ok: true };
  } catch (error) {
    console.error("[alerts] Resend request failed", error);
    return { ok: false, reason: "send_failed" };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

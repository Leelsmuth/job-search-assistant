import type { DigestPayload } from "@/modules/digest/types";
import { digestSubject } from "@/modules/digest/select";

export function renderDigestEmail(payload: DigestPayload, appBaseUrl: string): {
  subject: string;
  html: string;
  text: string;
} {
  const base = appBaseUrl.replace(/\/$/, "");
  const reminders = payload.followUps.length + payload.staleApplied.length;
  const subject = digestSubject({ jobs: payload.jobs.length, reminders });
  const text = renderText(payload, base);
  const html = renderHtml(payload, base);
  return { subject, html, text };
}

export function isDeliverableEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 320 && !value.includes("\n");
}

export async function sendDigestEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true } | { ok: false; reason: "resend_not_configured" | "send_failed" | "missing_recipient" }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.DIGEST_FROM_EMAIL?.trim();
  if (!apiKey || !from) {
    console.info(
      "[digest] RESEND_API_KEY or DIGEST_FROM_EMAIL is not set. Skipping email. The in-app digest is unchanged."
    );
    return { ok: false, reason: "resend_not_configured" };
  }
  if (!isDeliverableEmail(input.to)) {
    console.info("[digest] auth email is missing or not deliverable. Skipping email.");
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
      console.error("[digest] Resend rejected the email", { status: response.status });
      return { ok: false, reason: "send_failed" };
    }
    return { ok: true };
  } catch (error) {
    console.error("[digest] Resend request failed", error);
    return { ok: false, reason: "send_failed" };
  }
}

function renderText(payload: DigestPayload, base: string): string {
  const lines: string[] = ["Morning job digest", ""];
  if (payload.jobs.length === 0) {
    lines.push("No new eligible frontend matches since the last digest.", "");
  } else {
    lines.push("New matches", "");
    payload.jobs.forEach((job, index) => {
      lines.push(
        `${index + 1}. ${job.title} — ${job.companyName} (${scoreLabel(job)})`,
        `   ${job.locationLabel}`,
        job.reason ? `   ${job.reason}` : "",
        `   ${base}${job.href}`,
        job.postingUrl ? `   Posting: ${job.postingUrl}` : ""
      );
    });
    lines.push("");
  }

  lines.push("Follow-ups due", "");
  if (payload.followUps.length === 0) {
    lines.push("None.", "");
  } else {
    for (const item of payload.followUps) {
      lines.push(
        `- ${item.title} — ${item.companyName} (${item.overdue ? "overdue" : "due today"} ${item.followUpDate})`,
        `  ${base}${item.href}`
      );
    }
    lines.push("");
  }

  lines.push("Applied with no activity for 14+ days", "");
  if (payload.staleApplied.length === 0) {
    lines.push("None.", "");
  } else {
    for (const item of payload.staleApplied) {
      lines.push(
        `- ${item.title} — ${item.companyName} (${item.daysQuiet} days quiet)`,
        `  ${base}${item.href}`
      );
    }
    lines.push("");
  }

  lines.push(`Tracker: ${base}/applications`);
  return lines.filter((line) => line !== "").join("\n").replace(/\n{3,}/g, "\n\n");
}

function renderHtml(payload: DigestPayload, base: string): string {
  const jobs =
    payload.jobs.length === 0
      ? "<p>No new eligible frontend matches since the last digest.</p>"
      : `<ol>${payload.jobs
          .map((job) => {
            const posting = job.postingUrl
              ? ` · <a href="${escapeHtml(job.postingUrl)}">Posting</a>`
              : "";
            const reason = job.reason ? `<div style="color:#444">${escapeHtml(job.reason)}</div>` : "";
            return `<li style="margin:0 0 12px"><a href="${escapeHtml(base + job.href)}">${escapeHtml(job.title)}</a> — ${escapeHtml(job.companyName)} · ${escapeHtml(scoreLabel(job))}<div style="color:#444">${escapeHtml(job.locationLabel)}</div>${reason}${posting}</li>`;
          })
          .join("")}</ol>`;

  const followUps =
    payload.followUps.length === 0
      ? "<p>None.</p>"
      : `<ul>${payload.followUps
          .map(
            (item) =>
              `<li style="margin:0 0 8px"><a href="${escapeHtml(base + item.href)}">${escapeHtml(item.title)}</a> — ${escapeHtml(item.companyName)} · ${item.overdue ? "Overdue" : "Due today"} ${escapeHtml(item.followUpDate)}</li>`
          )
          .join("")}</ul>`;

  const stale =
    payload.staleApplied.length === 0
      ? "<p>None.</p>"
      : `<ul>${payload.staleApplied
          .map(
            (item) =>
              `<li style="margin:0 0 8px"><a href="${escapeHtml(base + item.href)}">${escapeHtml(item.title)}</a> — ${escapeHtml(item.companyName)} · ${item.daysQuiet} days quiet</li>`
          )
          .join("")}</ul>`;

  return `<!DOCTYPE html>
<html>
<body style="font-family:Georgia,serif;color:#1a1a1a;line-height:1.5;max-width:36rem">
  <h1 style="font-size:20px">Morning job digest</h1>
  <h2 style="font-size:16px">New matches</h2>
  ${jobs}
  <h2 style="font-size:16px">Follow-ups due</h2>
  ${followUps}
  <h2 style="font-size:16px">Applied with no activity for 14+ days</h2>
  ${stale}
  <p><a href="${escapeHtml(base)}/applications">Open your tracker</a></p>
</body>
</html>`;
}

function scoreLabel(job: { score: number; resumeScore?: number | null }): string {
  if (job.resumeScore == null) return String(job.score);
  return `${job.score} · ATS ${job.resumeScore}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

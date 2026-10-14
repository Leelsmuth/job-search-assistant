export function isMissingDigestSchema(error: unknown): boolean {
  const text = collectErrorText(error);
  if (!/job_digests|digest_emails_enabled|digest_last_sent_at|digest_last_generated_at/.test(text)) {
    return false;
  }
  return /does not exist|42P01|42703/i.test(text);
}

function collectErrorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (current instanceof Error) parts.push(current.message);
    if (typeof current === "object") {
      const record = current as { code?: unknown; message?: unknown; cause?: unknown };
      if (typeof record.code === "string") parts.push(record.code);
      if (typeof record.message === "string") parts.push(record.message);
      current = record.cause;
    } else {
      break;
    }
  }
  return parts.join("\n");
}

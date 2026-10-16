export function redactSecret(message: string, secret?: string | null): string {
  let text = message.replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]");
  if (secret && secret.length > 6) text = text.split(secret).join("[redacted]");
  return text.slice(0, 500);
}

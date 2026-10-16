export function isMissingExtensionSchema(error: unknown): boolean {
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
  const text = parts.join("\n");
  if (!/extension_tokens/.test(text)) return false;
  return /does not exist|42P01|42703/i.test(text);
}

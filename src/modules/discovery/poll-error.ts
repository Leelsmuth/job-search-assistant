const MAX_POLL_ERROR_CHARS = 500;

/** One line, safe to store on the poll row and show without host logs. */
export function formatPollError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.replace(/\s+/g, " ").trim();
    const text = message.startsWith(error.name) ? message : `${error.name}: ${message}`;
    return (text || error.name).slice(0, MAX_POLL_ERROR_CHARS);
  }
  const text = String(error).replace(/\s+/g, " ").trim();
  return (text || "Unknown poll error").slice(0, MAX_POLL_ERROR_CHARS);
}

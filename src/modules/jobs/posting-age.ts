export type PostingAgeTone = "fresh" | "recent" | "older";

export function postingAgeTone(postedAt: Date, now = new Date()): PostingAgeTone {
  const hours = (now.getTime() - postedAt.getTime()) / (60 * 60 * 1000);
  if (hours < 24) return "fresh";
  const days = Math.floor(hours / 24);
  if (days <= 3) return "recent";
  return "older";
}

export function formatAge(postedAt: Date, now = new Date()): string {
  const ms = now.getTime() - postedAt.getTime();
  if (ms < 60_000) return "just now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function postingAgeLabel(input: {
  postedAt: Date | null;
  postedAtSource: string | null;
  dateDiscovered: Date;
  now?: Date;
}): { text: string; tone: PostingAgeTone } {
  const now = input.now ?? new Date();
  const when = input.postedAt ?? input.dateDiscovered;
  const provider = input.postedAtSource === "provider" && input.postedAt != null;
  const prefix = provider ? "Posted" : "First seen";
  return { text: `${prefix} ${formatAge(when, now)}`, tone: postingAgeTone(when, now) };
}

export function postingAgeClass(tone: PostingAgeTone): string {
  if (tone === "fresh") return "text-green-700";
  if (tone === "recent") return "text-amber-700";
  return "text-muted-foreground";
}

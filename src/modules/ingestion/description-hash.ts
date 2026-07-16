import { createHash } from "crypto";

export function hashJobDescription(description: string): string {
  return createHash("sha256").update(description.trim()).digest("hex").slice(0, 16);
}

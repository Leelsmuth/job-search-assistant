import { sql } from "drizzle-orm";
import type { Db } from "@/server/actions/helpers";
import { isUuid } from "@/modules/applications/tracker";

export async function listDigestUserIds(db: Db): Promise<string[]> {
  const result = await db.execute<{ user_id: string }>(sql`
    select user_id from candidate_profiles
    union
    select user_id from saved_boards
    union
    select user_id from applications
    union
    select user_id from search_preferences
  `);
  const ids: string[] = [];
  for (const row of rowsFrom(result)) {
    const id = typeof row.user_id === "string" ? row.user_id : "";
    if (isUuid(id)) ids.push(id);
  }
  return ids;
}

export async function lookupAuthEmail(db: Db, userId: string): Promise<string | null> {
  if (!isUuid(userId)) return null;
  const result = await db.execute<{ email: string | null }>(sql`
    select email from auth.users where id::text = ${userId} limit 1
  `);
  for (const row of rowsFrom(result)) {
    if (typeof row.email === "string" && row.email.trim()) return row.email.trim();
  }
  return null;
}

function rowsFrom(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) {
    return result.rows as Array<Record<string, unknown>>;
  }
  return [];
}

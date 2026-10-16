import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { extensionTokens } from "@/db/schema";
import { withUserDb } from "@/db/user-context";
import { EXTENSION_SCHEMA_MESSAGE, type ExtensionScope } from "@/modules/extension/origin";
import { isMissingExtensionSchema } from "@/modules/extension/schema-error";
import {
  authorizeExtensionToken,
  hashExtensionToken,
  parseBearerAuthorization,
  type ExtensionTokenRecord,
} from "@/modules/extension/tokens";
import type { Db } from "@/server/actions/helpers";

/**
 * The bearer token is hashed and looked up before we know the user id, so this
 * one read uses the owner connection. It selects a single token row by hash.
 * Profile, answer, and tracker queries run afterwards inside withUserDb.
 */
async function findTokenByHash(hash: string): Promise<ExtensionTokenRecord | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: extensionTokens.id,
      userId: extensionTokens.userId,
      tokenHash: extensionTokens.tokenHash,
      scopes: extensionTokens.scopes,
      expiresAt: extensionTokens.expiresAt,
      revokedAt: extensionTokens.revokedAt,
    })
    .from(extensionTokens)
    .where(eq(extensionTokens.tokenHash, hash))
    .limit(1);
  return row ?? null;
}

export async function withExtensionScope<T>(
  authorization: string | null,
  scope: ExtensionScope | ExtensionScope[] | "any",
  fn: (db: Db, userId: string, tokenId: string) => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; status: number; error: string }> {
  const token = parseBearerAuthorization(authorization);
  if (!token) return { ok: false, status: 401, error: "Unauthorized" };
  const presentedHash = hashExtensionToken(token);
  let row: ExtensionTokenRecord | null;
  try {
    row = await findTokenByHash(presentedHash);
  } catch (error) {
    if (isMissingExtensionSchema(error)) {
      return { ok: false, status: 503, error: EXTENSION_SCHEMA_MESSAGE };
    }
    throw error;
  }
  const decision = authorizeExtensionToken({
    row,
    presentedHash,
    now: new Date(),
    scope,
  });
  if (!decision.ok) return decision;

  try {
    const value = await withUserDb(decision.userId, async (db) => {
      await db
        .update(extensionTokens)
        .set({ lastUsedAt: new Date() })
        .where(and(eq(extensionTokens.id, decision.tokenId), eq(extensionTokens.userId, decision.userId)));
      return fn(db, decision.userId, decision.tokenId);
    });
    return { ok: true, value };
  } catch (error) {
    if (isMissingExtensionSchema(error)) {
      return { ok: false, status: 503, error: EXTENSION_SCHEMA_MESSAGE };
    }
    throw error;
  }
}

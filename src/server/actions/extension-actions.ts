"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { extensionTokens } from "@/db/schema";
import { withUserDb } from "@/db/user-context";
import { getUser } from "@/lib/supabase/server";
import { EXTENSION_SCHEMA_MESSAGE } from "@/modules/extension/origin";
import { isMissingExtensionSchema } from "@/modules/extension/schema-error";
import { generateExtensionToken } from "@/modules/extension/tokens";
import type { ExtensionTokenSummary } from "@/modules/extension/token-summary";

async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

function toSummary(row: {
  id: string;
  tokenPrefix: string;
  scopes: unknown;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}): ExtensionTokenSummary {
  return {
    id: row.id,
    prefix: row.tokenPrefix,
    scopes: Array.isArray(row.scopes) ? row.scopes.filter((item): item is string => typeof item === "string") : [],
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getExtensionSettings(): Promise<{
  schemaReady: boolean;
  tokens: ExtensionTokenSummary[];
}> {
  const user = await requireUser();
  try {
    const tokens = await withUserDb(user.id, async (db) => {
      const rows = await db.query.extensionTokens.findMany({
        where: eq(extensionTokens.userId, user.id),
        orderBy: [desc(extensionTokens.createdAt)],
      });
      return rows.map(toSummary);
    });
    return { schemaReady: true, tokens };
  } catch (error) {
    if (isMissingExtensionSchema(error)) return { schemaReady: false, tokens: [] };
    throw error;
  }
}

export async function createExtensionToken(): Promise<{ token: string; summary: ExtensionTokenSummary }> {
  const user = await requireUser();
  const generated = generateExtensionToken();
  try {
    const summary = await withUserDb(user.id, async (db) => {
      const existing = await db.query.extensionTokens.findMany({
        where: eq(extensionTokens.userId, user.id),
      });
      const now = Date.now();
      const active = existing.filter((row) => !row.revokedAt && row.expiresAt.getTime() > now);
      if (active.length >= 5) {
        throw new Error("Revoke an existing extension token first (limit 5).");
      }
      const [row] = await db
        .insert(extensionTokens)
        .values({
          userId: user.id,
          tokenHash: generated.tokenHash,
          tokenPrefix: generated.tokenPrefix,
          scopes: generated.scopes,
          expiresAt: generated.expiresAt,
        })
        .returning();
      if (!row) throw new Error("Could not create an extension token");
      return toSummary(row);
    });
    revalidatePath("/settings");
    return { token: generated.token, summary };
  } catch (error) {
    if (isMissingExtensionSchema(error)) throw new Error(EXTENSION_SCHEMA_MESSAGE);
    throw error;
  }
}

export async function revokeExtensionToken(tokenId: string): Promise<void> {
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(tokenId)) throw new Error("Token not found");
  try {
    await withUserDb(user.id, async (db) => {
      await db
        .update(extensionTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(extensionTokens.id, tokenId), eq(extensionTokens.userId, user.id)));
    });
  } catch (error) {
    if (isMissingExtensionSchema(error)) throw new Error(EXTENSION_SCHEMA_MESSAGE);
    throw error;
  }
  revalidatePath("/settings");
}

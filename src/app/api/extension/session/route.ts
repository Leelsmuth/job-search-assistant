import { and, eq } from "drizzle-orm";
import { extensionTokens } from "@/db/schema";
import { withExtensionScope } from "@/modules/extension/authenticate";
import { extensionJson, extensionPreflight } from "@/modules/extension/http";

export async function OPTIONS(request: Request) {
  return extensionPreflight(request);
}

export async function GET(request: Request) {
  try {
    const result = await withExtensionScope(
      request.headers.get("authorization"),
      "any",
      async (db, userId, tokenId) => {
        const row = await db.query.extensionTokens.findFirst({
          where: and(eq(extensionTokens.id, tokenId), eq(extensionTokens.userId, userId)),
          columns: { tokenPrefix: true, expiresAt: true, scopes: true },
        });
        return {
          linked: true,
          prefix: row?.tokenPrefix ?? null,
          expiresAt: row?.expiresAt.toISOString() ?? null,
          scopes: Array.isArray(row?.scopes) ? row.scopes : [],
        };
      }
    );
    if (!result.ok) return extensionJson(request, result.status, { error: result.error });
    return extensionJson(request, 200, result.value);
  } catch (error) {
    console.error("[extension] session failed", error instanceof Error ? error.message : "error");
    return extensionJson(request, 500, { error: "Could not check the extension token" });
  }
}

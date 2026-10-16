import { extensionJson, extensionPreflight, readJson } from "@/modules/extension/http";
import { withExtensionScope } from "@/modules/extension/authenticate";
import { loadExtensionFillContext } from "@/modules/extension/fill-context";
import { parseFillPayload } from "@/modules/extension/payloads";

export async function OPTIONS(request: Request) {
  return extensionPreflight(request);
}

export async function POST(request: Request) {
  try {
    const body = parseFillPayload(await readJson(request, 8_000));
    const result = await withExtensionScope(
      request.headers.get("authorization"),
      ["profile:read", "answers:read"],
      (db, userId) => loadExtensionFillContext(db, userId, body.pageUrl)
    );
    if (!result.ok) return extensionJson(request, result.status, { error: result.error });
    return extensionJson(request, 200, result.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load application data";
    if (/valid page URL|too large/i.test(message)) {
      return extensionJson(request, 400, { error: message });
    }
    console.error("[extension] fill failed", message);
    return extensionJson(request, 500, { error: "Could not load application data" });
  }
}

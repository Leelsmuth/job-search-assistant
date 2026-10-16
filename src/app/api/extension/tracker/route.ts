import { revalidatePath } from "next/cache";
import { extensionJson, extensionPreflight, readJson } from "@/modules/extension/http";
import { withExtensionScope } from "@/modules/extension/authenticate";
import { parseTrackerPayload } from "@/modules/extension/payloads";
import { saveExtensionTracker } from "@/modules/extension/tracker-write";

export async function OPTIONS(request: Request) {
  return extensionPreflight(request);
}

export async function POST(request: Request) {
  try {
    const body = parseTrackerPayload(await readJson(request, 40_000));
    const result = await withExtensionScope(request.headers.get("authorization"), "tracker:write", (db, userId) =>
      saveExtensionTracker(db, userId, body)
    );
    if (!result.ok) return extensionJson(request, result.status, { error: result.error });
    revalidatePath("/applications");
    revalidatePath("/jobs");
    revalidatePath("/dashboard");
    return extensionJson(request, 200, result.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the job";
    if (/required|valid|fewer|http|too large/i.test(message)) {
      return extensionJson(request, 400, { error: message });
    }
    console.error("[extension] tracker failed", message);
    return extensionJson(request, 500, { error: "Could not save the job" });
  }
}

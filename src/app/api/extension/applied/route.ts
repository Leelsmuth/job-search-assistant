import { revalidatePath } from "next/cache";
import { extensionJson, extensionPreflight, readJson } from "@/modules/extension/http";
import { withExtensionScope } from "@/modules/extension/authenticate";
import { parseAppliedPayload } from "@/modules/extension/payloads";
import { markExtensionApplied } from "@/modules/extension/tracker-write";

export async function OPTIONS(request: Request) {
  return extensionPreflight(request);
}

export async function POST(request: Request) {
  try {
    const body = parseAppliedPayload(await readJson(request, 80_000));
    const result = await withExtensionScope(request.headers.get("authorization"), "tracker:write", (db, userId) =>
      markExtensionApplied(db, userId, body)
    );
    if (!result.ok) return extensionJson(request, result.status, { error: result.error });
    revalidatePath("/applications");
    revalidatePath(`/applications/${result.value.applicationId}`);
    revalidatePath("/jobs");
    revalidatePath(`/jobs/${result.value.jobId}`);
    revalidatePath("/dashboard");
    return extensionJson(request, 200, result.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not mark the application";
    if (/not found/i.test(message)) return extensionJson(request, 404, { error: message });
    if (/required|valid|Save the job|too large|fewer/i.test(message)) {
      return extensionJson(request, 400, { error: message });
    }
    console.error("[extension] applied failed", message);
    return extensionJson(request, 500, { error: "Could not mark the application" });
  }
}

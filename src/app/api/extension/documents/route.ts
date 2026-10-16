import { extensionBinary, extensionJson, extensionPreflight } from "@/modules/extension/http";
import { withExtensionScope } from "@/modules/extension/authenticate";
import { renderExtensionDocument } from "@/modules/extension/documents";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function OPTIONS(request: Request) {
  return extensionPreflight(request);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const jobParam = url.searchParams.get("jobId");
    if (kind !== "resume" && kind !== "coverLetter") {
      return extensionJson(request, 400, { error: "Document kind must be resume or coverLetter" });
    }
    const jobId = jobParam && UUID.test(jobParam) ? jobParam : null;
    if (jobParam && !jobId) return extensionJson(request, 400, { error: "Job id is invalid" });
    if (kind === "coverLetter" && !jobId) {
      return extensionJson(request, 400, { error: "A job is required for a cover letter" });
    }
    const result = await withExtensionScope(request.headers.get("authorization"), "answers:read", (db, userId) =>
      renderExtensionDocument(db, userId, kind, jobId)
    );
    if (!result.ok) return extensionJson(request, result.status, { error: result.error });
    if (!result.value) return extensionJson(request, 404, { error: "No document is available" });
    return extensionBinary(request, result.value.bytes, result.value.filename);
  } catch (error) {
    console.error("[extension] document failed", error instanceof Error ? error.message : "error");
    return extensionJson(request, 500, { error: "Could not prepare the document" });
  }
}

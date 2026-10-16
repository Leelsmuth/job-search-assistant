import { extensionCorsHeaders, isAllowedExtensionOrigin } from "@/modules/extension/cors";

export function extensionPreflight(request: Request): Response {
  const origin = request.headers.get("origin");
  if (!isAllowedExtensionOrigin(origin)) {
    return new Response(null, { status: 403, headers: extensionCorsHeaders(origin) });
  }
  return new Response(null, { status: 204, headers: extensionCorsHeaders(origin) });
}

export function extensionJson(request: Request, status: number, body: unknown): Response {
  const origin = request.headers.get("origin");
  const headers = extensionCorsHeaders(origin);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  if (origin && !isAllowedExtensionOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Origin is not allowed" }), { status: 403, headers });
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export function extensionBinary(
  request: Request,
  bytes: Uint8Array,
  filename: string
): Response {
  const origin = request.headers.get("origin");
  const headers = extensionCorsHeaders(origin);
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]+/g, "-")}"`);
  headers.set("Cache-Control", "no-store");
  if (origin && !isAllowedExtensionOrigin(origin)) {
    return extensionJson(request, 403, { error: "Origin is not allowed" });
  }
  return new Response(Buffer.from(bytes), { status: 200, headers });
}

export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new Error("Request is too large");
  if (!text.trim()) return {};
  return JSON.parse(text) as unknown;
}

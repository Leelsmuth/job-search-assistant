import { APP_ORIGIN } from "@/modules/extension/origin";

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function errorMessage(data: unknown, status: number): string {
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") return data.error;
  return `Request failed (${status})`;
}

export async function apiRequest(path: string, token: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${APP_ORIGIN}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await readBody(response);
  if (!response.ok) throw new Error(errorMessage(data, response.status));
  return data;
}

export async function apiPdf(
  path: string,
  token: string
): Promise<{ filename: string; bytes: number[] }> {
  const response = await fetch(`${APP_ORIGIN}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const data = await readBody(response);
    throw new Error(errorMessage(data, response.status));
  }
  const bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] || "document.pdf";
  return { filename, bytes };
}

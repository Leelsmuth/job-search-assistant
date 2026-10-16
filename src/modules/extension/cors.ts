import { EXTENSION_ORIGIN } from "@/modules/extension/origin";

const ORIGIN_PATTERN = /^chrome-extension:\/\/[a-p]{32}$/;

export function resolveExtensionOrigin(): string {
  const override = process.env.EXTENSION_ORIGIN?.trim();
  if (override && ORIGIN_PATTERN.test(override)) return override;
  return EXTENSION_ORIGIN;
}

export function isAllowedExtensionOrigin(origin: string | null): boolean {
  return Boolean(origin) && origin === resolveExtensionOrigin();
}

export function extensionCorsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  headers.set("Vary", "Origin");
  if (!isAllowedExtensionOrigin(origin) || !origin) return headers;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Max-Age", "600");
  return headers;
}

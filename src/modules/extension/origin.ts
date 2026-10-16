/** Production app the extension is allowed to call. */
export const APP_ORIGIN = "https://job-search-assistant-virid.vercel.app";

/**
 * Chrome extension id derived from the public key in extension/public/manifest.json.
 * Unpacked loads keep this id, so CORS can allow exactly one origin.
 */
export const EXTENSION_ID = "epkapkpodghpodnfdpmfhenkdhmnigni";

export const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`;

export const EXTENSION_SCOPES = ["profile:read", "answers:read", "tracker:write"] as const;

export type ExtensionScope = (typeof EXTENSION_SCOPES)[number];

export const EXTENSION_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const EXTENSION_SCHEMA_MESSAGE =
  "Apply migration 0020_extension_tokens.sql in the Supabase SQL editor before using the browser extension.";

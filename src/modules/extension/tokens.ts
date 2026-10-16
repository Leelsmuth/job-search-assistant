import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  EXTENSION_SCOPES,
  EXTENSION_TOKEN_TTL_MS,
  type ExtensionScope,
} from "@/modules/extension/origin";

const TOKEN_PATTERN = /^jsa_[A-Za-z0-9_-]{20,200}$/;

export type ExtensionTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  scopes: unknown;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type ExtensionDecision =
  | { ok: true; userId: string; tokenId: string }
  | { ok: false; status: number; error: string };

export function hashExtensionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateExtensionToken(now = Date.now()): {
  token: string;
  tokenHash: string;
  tokenPrefix: string;
  scopes: ExtensionScope[];
  expiresAt: Date;
} {
  const token = `jsa_${randomBytes(32).toString("base64url")}`;
  return {
    token,
    tokenHash: hashExtensionToken(token),
    tokenPrefix: token.slice(0, 12),
    scopes: [...EXTENSION_SCOPES],
    expiresAt: new Date(now + EXTENSION_TOKEN_TTL_MS),
  };
}

export function parseBearerAuthorization(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1];
  if (!TOKEN_PATTERN.test(token)) return null;
  return token;
}

function knownScopes(value: unknown): ExtensionScope[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ExtensionScope =>
    EXTENSION_SCOPES.some((scope) => scope === item)
  );
}

function hashesMatch(stored: string, presented: string): boolean {
  const left = Buffer.from(stored);
  const right = Buffer.from(presented);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function authorizeExtensionToken(input: {
  row: ExtensionTokenRecord | null;
  presentedHash: string;
  now: Date;
  scope: ExtensionScope | ExtensionScope[] | "any";
}): ExtensionDecision {
  const row = input.row;
  if (!row || !hashesMatch(row.tokenHash, input.presentedHash)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  if (row.revokedAt) {
    return { ok: false, status: 401, error: "This extension token was revoked" };
  }
  if (row.expiresAt.getTime() <= input.now.getTime()) {
    return { ok: false, status: 401, error: "This extension token has expired" };
  }
  const scopes = knownScopes(row.scopes);
  if (scopes.length === 0) {
    return { ok: false, status: 403, error: "This extension token cannot do that" };
  }
  if (input.scope !== "any") {
    const required = Array.isArray(input.scope) ? input.scope : [input.scope];
    if (required.some((item) => !scopes.includes(item))) {
      return { ok: false, status: 403, error: "This extension token cannot do that" };
    }
  }
  return { ok: true, userId: row.userId, tokenId: row.id };
}

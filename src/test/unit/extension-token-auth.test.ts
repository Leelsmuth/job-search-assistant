import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EXTENSION_ID, EXTENSION_ORIGIN, EXTENSION_SCOPES } from "@/modules/extension/origin";
import {
  authorizeExtensionToken,
  generateExtensionToken,
  hashExtensionToken,
  parseBearerAuthorization,
  type ExtensionTokenRecord,
} from "@/modules/extension/tokens";
import { isAllowedExtensionOrigin, resolveExtensionOrigin } from "@/modules/extension/cors";
import { setNativeChecked, setNativeValue } from "@/modules/extension/dom-value";
import { urlsReferToSameJob } from "@/modules/extension/urls";

const NOW = new Date("2026-10-16T12:00:00.000Z");

function row(overrides: Partial<ExtensionTokenRecord> = {}): ExtensionTokenRecord {
  const token = "jsa_abcdefghijklmnopqrstuvwxyz012345";
  return {
    id: "11111111-1111-1111-1111-111111111111",
    userId: "22222222-2222-2222-2222-222222222222",
    tokenHash: hashExtensionToken(token),
    scopes: [...EXTENSION_SCOPES],
    expiresAt: new Date("2026-10-30T12:00:00.000Z"),
    revokedAt: null,
    ...overrides,
  };
}

describe("extension token auth", () => {
  const originalOrigin = process.env.EXTENSION_ORIGIN;

  afterEach(() => {
    if (originalOrigin === undefined) delete process.env.EXTENSION_ORIGIN;
    else process.env.EXTENSION_ORIGIN = originalOrigin;
  });

  it("hashes tokens and never stores the plaintext as the hash", () => {
    const generated = generateExtensionToken(NOW.getTime());
    expect(generated.token.startsWith("jsa_")).toBe(true);
    expect(generated.tokenHash).toHaveLength(64);
    expect(generated.tokenHash).not.toContain(generated.token);
    expect(hashExtensionToken(generated.token)).toBe(generated.tokenHash);
    expect(generated.scopes).toEqual([...EXTENSION_SCOPES]);
    expect(generated.expiresAt.toISOString()).toBe("2026-10-30T12:00:00.000Z");
  });

  it("parses a bearer token and rejects anything else", () => {
    const token = `jsa_${"a".repeat(24)}`;
    expect(parseBearerAuthorization(`Bearer ${token}`)).toBe(token);
    expect(parseBearerAuthorization("Bearer short")).toBeNull();
    expect(parseBearerAuthorization("Basic abc")).toBeNull();
    expect(parseBearerAuthorization(null)).toBeNull();
  });

  it("accepts a live token with the required scope", () => {
    const token = "jsa_abcdefghijklmnopqrstuvwxyz012345";
    const decision = authorizeExtensionToken({
      row: row(),
      presentedHash: hashExtensionToken(token),
      now: NOW,
      scope: ["profile:read", "answers:read"],
    });
    expect(decision).toEqual({
      ok: true,
      userId: "22222222-2222-2222-2222-222222222222",
      tokenId: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("rejects missing, revoked, expired, and under-scoped tokens", () => {
    const hash = hashExtensionToken("jsa_abcdefghijklmnopqrstuvwxyz012345");
    expect(authorizeExtensionToken({ row: null, presentedHash: hash, now: NOW, scope: "any" }).ok).toBe(false);
    expect(
      authorizeExtensionToken({
        row: row({ tokenHash: hashExtensionToken("jsa_differenttokenvalue0123456789") }),
        presentedHash: hash,
        now: NOW,
        scope: "any",
      })
    ).toMatchObject({ ok: false, status: 401 });
    expect(
      authorizeExtensionToken({
        row: row({ revokedAt: new Date("2026-10-01T00:00:00.000Z") }),
        presentedHash: hash,
        now: NOW,
        scope: "any",
      })
    ).toMatchObject({ status: 401, error: expect.stringMatching(/revoked/i) });
    expect(
      authorizeExtensionToken({
        row: row({ expiresAt: new Date("2026-10-01T00:00:00.000Z") }),
        presentedHash: hash,
        now: NOW,
        scope: "any",
      })
    ).toMatchObject({ status: 401, error: expect.stringMatching(/expired/i) });
    expect(
      authorizeExtensionToken({
        row: row({ scopes: ["profile:read"] }),
        presentedHash: hash,
        now: NOW,
        scope: "tracker:write",
      })
    ).toMatchObject({ status: 403 });
  });

  it("allows only the pinned extension origin", () => {
    delete process.env.EXTENSION_ORIGIN;
    expect(resolveExtensionOrigin()).toBe(EXTENSION_ORIGIN);
    expect(isAllowedExtensionOrigin(EXTENSION_ORIGIN)).toBe(true);
    expect(isAllowedExtensionOrigin("https://job-search-assistant-virid.vercel.app")).toBe(false);
    expect(isAllowedExtensionOrigin("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe(false);
    expect(isAllowedExtensionOrigin("*")).toBe(false);
    expect(isAllowedExtensionOrigin(null)).toBe(false);
    process.env.EXTENSION_ORIGIN = "*";
    expect(resolveExtensionOrigin()).toBe(EXTENSION_ORIGIN);
    process.env.EXTENSION_ORIGIN = "https://evil.example";
    expect(resolveExtensionOrigin()).toBe(EXTENSION_ORIGIN);
    process.env.EXTENSION_ORIGIN = "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(resolveExtensionOrigin()).toBe("chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });

  it("pins the manifest key to the same extension id", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), "extension/public/manifest.json"), "utf8")
    ) as { key: string; permissions: string[]; host_permissions: string[] };
    const der = Buffer.from(manifest.key, "base64");
    const hash = createHash("sha256").update(der).digest();
    let id = "";
    for (const byte of hash.subarray(0, 16)) {
      id += String.fromCharCode(97 + (byte >> 4));
      id += String.fromCharCode(97 + (byte & 0xf));
    }
    expect(id).toBe(EXTENSION_ID);
    expect(manifest.permissions).toEqual(["activeTab", "scripting", "storage", "sidePanel"]);
    expect(manifest.host_permissions).toEqual([
      "https://job-search-assistant-virid.vercel.app/*",
      "https://*.greenhouse.io/*",
      "https://jobs.lever.co/*",
      "https://jobs.ashbyhq.com/*",
      "https://*.myworkdayjobs.com/*",
      "https://*.myworkdaysite.com/*",
    ]);
    const extensionSource = [
      "extension/src/content.ts",
      "extension/src/apply-page.ts",
      "extension/src/combobox-dom.ts",
      "extension/src/background.ts",
      "extension/src/sidepanel.ts",
      "extension/src/api.ts",
    ]
      .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
      .join("\n");
    expect(extensionSource).not.toMatch(/service_role|SUPABASE_|eval\(|new Function|\.submit\s*\(|\.click\s*\(/);
    expect(extensionSource).not.toMatch(/key:\s*["']Enter["']/);
    expect(extensionSource).toContain("getOwnPropertyDescriptor");
    expect(extensionSource).toContain("will not submit");
  });

  it("sets values through the native setter and input/change events", () => {
    const events: string[] = [];
    let stored = "";
    const element = {
      get value() {
        return stored;
      },
      set value(next: string) {
        stored = `direct:${next}`;
      },
      dispatchEvent(event: Event) {
        events.push(event.type);
        return true;
      },
    };
    const setter = function (value: string) {
      stored = `native:${value}`;
    };
    setNativeValue(element, "Ada", setter);
    expect(stored).toBe("native:Ada");
    expect(events).toEqual(["input", "change"]);

    let checked = false;
    const choice = {
      get checked() {
        return checked;
      },
      set checked(next: boolean) {
        checked = next;
      },
      dispatchEvent(event: Event) {
        events.push(event.type);
        return true;
      },
    };
    setNativeChecked(choice, true);
    expect(choice.checked).toBe(true);
  });

  it("treats an application url and its job url as the same role", () => {
    expect(
      urlsReferToSameJob(
        "https://boards.greenhouse.io/acme/jobs/123?gh_src=abc",
        "https://job-boards.greenhouse.io/acme/jobs/123"
      )
    ).toBe(true);
    expect(
      urlsReferToSameJob(
        "https://acme.wd1.myworkdayjobs.com/en-US/site/job/Toronto/Engineer_R-12345",
        "https://acme.wd1.myworkdayjobs.com/site/job/Toronto/Engineer_R12345/apply/applyManually"
      )
    ).toBe(true);
    expect(
      urlsReferToSameJob(
        "https://jobs.lever.co/acme/11111111-1111-1111-1111-111111111111",
        "https://jobs.lever.co/other/11111111-1111-1111-1111-111111111111"
      )
    ).toBe(false);
  });

  it("keeps extension database access sequential and scoped", () => {
    const auth = readFileSync(resolve(process.cwd(), "src/modules/extension/authenticate.ts"), "utf8");
    const fill = readFileSync(resolve(process.cwd(), "src/modules/extension/fill-context.ts"), "utf8");
    const route = readFileSync(resolve(process.cwd(), "src/app/api/extension/fill/route.ts"), "utf8");
    expect(auth).toContain("withUserDb");
    expect(auth).not.toContain("Promise.all");
    expect(fill).not.toContain("Promise.all");
    expect(fill).not.toContain("draftApplicationAnswer");
    expect(route).toContain("withExtensionScope");
    expect(route).toContain("profile:read");
    expect(route).toContain("answers:read");
    expect(randomBytes(1).length).toBe(1);
  });
});

describe("extension token migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0020_extension_tokens.sql"),
    "utf8"
  );

  it("stores only a hash and locks the table to the signed-in user", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS extension_tokens");
    expect(migration).toContain("token_hash");
    expect(migration).not.toContain("token_plaintext");
    expect(migration).toContain("ALTER TABLE extension_tokens ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON TABLE extension_tokens FROM anon");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE extension_tokens TO authenticated");
    expect(migration).toContain('POLICY "Users own their extension tokens"');
    expect(migration).toContain("USING ((select auth.uid()) = user_id)");
    expect(migration).toContain("WITH CHECK ((select auth.uid()) = user_id)");
    for (const scope of EXTENSION_SCOPES) expect(migration).toContain(scope);
    const unwrapped = migration.replaceAll("(select auth.uid())", "");
    expect(unwrapped).not.toContain("auth.uid()");
  });
});

import { describe, it, expect, vi } from "vitest";
import http from "node:http";
import {
  assertPublicHttpUrl,
  followSafeRedirects,
  isBlockedIpAddress,
  UnsafeUrlError,
} from "@/modules/ingestion/ssrf";
import { genericUrlAdapter } from "@/modules/ingestion/adapters";

const publicResolver = async () => ["93.184.216.34"];

describe("isBlockedIpAddress", () => {
  it("blocks private, loopback, link-local, and metadata addresses", () => {
    const blocked = [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.20",
      "169.254.169.254",
      "169.254.170.2",
      "0.0.0.0",
      "100.100.100.200",
      "::1",
      "::",
      "fd00:ec2::254",
      "fe80::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "[::1]",
    ];
    for (const ip of blocked) {
      expect(isBlockedIpAddress(ip), ip).toBe(true);
    }
  });

  it("allows public addresses", () => {
    expect(isBlockedIpAddress("8.8.8.8")).toBe(false);
    expect(isBlockedIpAddress("1.1.1.1")).toBe(false);
    expect(isBlockedIpAddress("172.32.0.1")).toBe(false);
    expect(isBlockedIpAddress("2001:4860:4860::8888")).toBe(false);
  });
});

describe("assertPublicHttpUrl", () => {
  it("allows only http and https", async () => {
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertPublicHttpUrl("ftp://example.com/job")).rejects.toThrow(
      /http and https/
    );
    await expect(
      assertPublicHttpUrl("https://example.com/jobs/1", publicResolver)
    ).resolves.toMatchObject({ protocol: "https:", hostname: "example.com" });
    await expect(assertPublicHttpUrl("https://1.1.1.1/jobs")).resolves.toMatchObject({
      protocol: "https:",
      hostname: "1.1.1.1",
    });
  });

  it("blocks credentials, localhost, and metadata hostnames before DNS", async () => {
    const resolveHost = vi.fn(publicResolver);
    await expect(
      assertPublicHttpUrl("http://user:pass@example.com/job", resolveHost)
    ).rejects.toThrow(/credentials/);
    await expect(assertPublicHttpUrl("http://localhost/latest", resolveHost)).rejects.toThrow(
      /not allowed/
    );
    await expect(
      assertPublicHttpUrl("http://metadata.google.internal/computeMetadata/v1/", resolveHost)
    ).rejects.toThrow(/not allowed/);
    expect(resolveHost).not.toHaveBeenCalled();
  });

  it("blocks obfuscated loopback literals normalized by the URL parser", async () => {
    await expect(assertPublicHttpUrl("http://2130706433/")).rejects.toThrow(/loopback|private/);
    await expect(assertPublicHttpUrl("http://0x7f000001/")).rejects.toThrow(/loopback|private/);
    await expect(assertPublicHttpUrl("http://127.1/")).rejects.toThrow(/loopback|private/);
    await expect(assertPublicHttpUrl("http://[::ffff:7f00:1]/")).rejects.toThrow(
      /loopback|private/
    );
  });

  it("blocks hostnames that resolve to a private address", async () => {
    await expect(
      assertPublicHttpUrl("https://evil.example/job", async () => ["10.0.0.5"])
    ).rejects.toThrow(/private, loopback, link-local, or metadata/);
  });

  it("fails closed when DNS returns no addresses", async () => {
    await expect(
      assertPublicHttpUrl("https://missing.example/job", async () => [])
    ).rejects.toThrow(/did not resolve/);
  });
});

describe("followSafeRedirects", () => {
  it("does not request a redirect target on a metadata address", async () => {
    const requested: string[] = [];
    await expect(
      followSafeRedirects(
        "https://jobs.example/role",
        async (url) => {
          requested.push(url.href);
          return {
            status: 302,
            location: "http://169.254.169.254/latest/meta-data/",
            body: new Uint8Array(),
          };
        },
        { resolveHost: publicResolver }
      )
    ).rejects.toThrow(/private, loopback, link-local, or metadata/);
    expect(requested).toEqual(["https://jobs.example/role"]);
  });

  it("follows a redirect only after the next host resolves to a public address", async () => {
    const requested: string[] = [];
    const result = await followSafeRedirects(
      "https://jobs.example/start",
      async (url) => {
        requested.push(url.hostname);
        if (url.hostname === "jobs.example") {
          return {
            status: 301,
            location: "https://boards.example/job",
            body: new Uint8Array(),
          };
        }
        return { status: 200, location: null, body: new TextEncoder().encode("ok") };
      },
      {
        resolveHost: async (hostname) => {
          if (hostname === "boards.example") return ["1.1.1.1"];
          return ["93.184.216.34"];
        },
      }
    );
    expect(requested).toEqual(["jobs.example", "boards.example"]);
    expect(result.hop.status).toBe(200);
  });

  it("stops after too many redirects", async () => {
    await expect(
      followSafeRedirects(
        "https://jobs.example/loop",
        async () => ({
          status: 302,
          location: "https://jobs.example/loop",
          body: new Uint8Array(),
        }),
        { resolveHost: publicResolver, maxRedirects: 2 }
      )
    ).rejects.toThrow(/Too many redirects/);
  });
});

describe("genericUrlAdapter", () => {
  it("does not open a connection to a metadata address", async () => {
    const request = vi.spyOn(http, "request");
    const raw = await genericUrlAdapter.fetch("http://169.254.169.254/latest/meta-data/");
    expect(request).not.toHaveBeenCalled();
    expect(String((raw.rawPayload as { error?: string }).error)).toMatch(
      /private, loopback, link-local, or metadata/
    );
    request.mockRestore();
  });
});

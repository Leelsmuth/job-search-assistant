import http from "node:http";
import https from "node:https";
import * as dns from "node:dns/promises";
import { lookup as dnsLookupCb } from "node:dns";
import type { LookupOptions } from "node:dns";
import { BlockList, isIP } from "node:net";

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_BYTES = 1_000_000;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
]);

const blockedAddresses = new BlockList();
blockedAddresses.addSubnet("0.0.0.0", 8, "ipv4");
blockedAddresses.addSubnet("10.0.0.0", 8, "ipv4");
blockedAddresses.addSubnet("127.0.0.0", 8, "ipv4");
blockedAddresses.addSubnet("169.254.0.0", 16, "ipv4");
blockedAddresses.addSubnet("172.16.0.0", 12, "ipv4");
blockedAddresses.addSubnet("192.168.0.0", 16, "ipv4");
blockedAddresses.addAddress("100.100.100.200", "ipv4");
blockedAddresses.addAddress("::", "ipv6");
blockedAddresses.addAddress("::1", "ipv6");
blockedAddresses.addSubnet("fc00::", 7, "ipv6");
blockedAddresses.addSubnet("fe80::", 10, "ipv6");

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export type HostResolver = (hostname: string) => Promise<string[]>;

export type HttpHop = {
  status: number;
  location: string | null;
  body: Uint8Array;
};

function stripIpBrackets(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function ipv4FromMapped(ipv6: string): string | null {
  const normalized = ipv6.toLowerCase();
  const dotted = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted && isIP(dotted[1]) === 4) return dotted[1];

  const hex = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const hi = Number.parseInt(hex[1], 16);
  const lo = Number.parseInt(hex[2], 16);
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

/** True for private, loopback, link-local, metadata, and unparseable addresses. */
export function isBlockedIpAddress(ip: string): boolean {
  const bare = stripIpBrackets(ip);
  const family = isIP(bare);
  if (family === 4) return blockedAddresses.check(bare, "ipv4");
  if (family === 6) {
    const mapped = ipv4FromMapped(bare);
    if (mapped) return isBlockedIpAddress(mapped);
    return blockedAddresses.check(bare, "ipv6");
  }
  return true;
}

function isBlockedHostname(hostname: string): boolean {
  const host = stripIpBrackets(hostname).replace(/\.$/, "").toLowerCase();
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host)) return true;
  if (host.endsWith(".localhost")) return true;
  if (host.endsWith(".metadata.google.internal")) return true;
  return false;
}

export async function resolveHostAddresses(hostname: string): Promise<string[]> {
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

function assertPublicAddresses(addresses: string[]): void {
  if (addresses.length === 0) {
    throw new UnsafeUrlError("URL host did not resolve");
  }
  if (addresses.some((address) => isBlockedIpAddress(address))) {
    throw new UnsafeUrlError(
      "URL resolves to a private, loopback, link-local, or metadata address"
    );
  }
}

export async function assertPublicHttpUrl(
  raw: string,
  resolveHost: HostResolver = resolveHostAddresses
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Invalid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https URLs are allowed");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with embedded credentials are not allowed");
  }

  const hostname = stripIpBrackets(url.hostname);
  if (isBlockedHostname(hostname)) {
    throw new UnsafeUrlError("URL host is not allowed");
  }

  if (isIP(hostname)) {
    assertPublicAddresses([hostname]);
    return url;
  }

  let addresses: string[];
  try {
    addresses = await resolveHost(hostname);
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw error;
    throw new UnsafeUrlError("URL host did not resolve");
  }
  assertPublicAddresses(addresses);
  return url;
}

export async function followSafeRedirects(
  rawUrl: string,
  request: (url: URL) => Promise<HttpHop>,
  options?: { resolveHost?: HostResolver; maxRedirects?: number }
): Promise<{ url: URL; hop: HttpHop }> {
  const maxRedirects = options?.maxRedirects ?? MAX_REDIRECTS;
  let current = await assertPublicHttpUrl(rawUrl, options?.resolveHost);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const result = await request(current);
    if (result.status >= 300 && result.status < 400 && result.location) {
      if (hop === maxRedirects) {
        throw new UnsafeUrlError("Too many redirects");
      }
      const next = new URL(result.location, current);
      current = await assertPublicHttpUrl(next.href, options?.resolveHost);
      continue;
    }
    return { url: current, hop: result };
  }

  throw new UnsafeUrlError("Too many redirects");
}

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function ssrfLookup(
  hostname: string,
  options: LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | { address: string; family: number }[],
    family?: number
  ) => void
): void {
  dnsLookupCb(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) {
      callback(err, "");
      return;
    }
    const list = Array.isArray(addresses) ? addresses : [];
    if (list.length === 0 || list.some((entry) => isBlockedIpAddress(entry.address))) {
      const blocked = Object.assign(
        new Error("URL resolves to a private, loopback, link-local, or metadata address"),
        { code: "EBLOCKED" }
      ) as NodeJS.ErrnoException;
      callback(blocked, "");
      return;
    }
    if (options.all) {
      callback(
        null,
        list.map((entry) => ({ address: entry.address, family: entry.family }))
      );
      return;
    }
    callback(null, list[0].address, list[0].family);
  });
}

function outgoingHeaders(url: URL, headers: Record<string, string>): Record<string, string> {
  const outgoing: Record<string, string> = {
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "user-agent": "JobSearchAssistant/1.0",
  };
  for (const [key, value] of Object.entries(headers)) {
    outgoing[key.toLowerCase()] = value;
  }
  outgoing.host = url.host;
  return outgoing;
}

function requestOnce(
  url: URL,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<HttpHop> {
  const transport = url.protocol === "https:" ? https : http;
  const hostname = stripIpBrackets(url.hostname);

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: url.protocol,
        hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: outgoingHeaders(url, headers),
        lookup: ssrfLookup,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            req.destroy(new UnsafeUrlError("Response too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            location: headerValue(res.headers.location),
            body: Buffer.concat(chunks),
          });
        });
        res.on("error", reject);
      }
    );
    req.on("timeout", () => {
      req.destroy(new UnsafeUrlError("Request timed out"));
    });
    req.on("error", reject);
    req.end();
  });
}

export async function fetchPublicHttpUrl(
  rawUrl: string,
  init?: { headers?: Record<string, string>; timeoutMs?: number }
): Promise<Response> {
  const result = await followSafeRedirects(rawUrl, (url) =>
    requestOnce(url, init?.headers ?? {}, init?.timeoutMs ?? 10_000)
  );
  return new Response(Buffer.from(result.hop.body), { status: result.hop.status });
}

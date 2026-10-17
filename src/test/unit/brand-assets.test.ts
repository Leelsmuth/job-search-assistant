import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string): Buffer {
  return readFileSync(resolve(process.cwd(), relativePath));
}

function pngSize(buffer: Buffer): { width: number; height: number } {
  expect(buffer.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(buffer.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function icoSizes(buffer: Buffer): string[] {
  expect(buffer.readUInt16LE(0)).toBe(0);
  expect(buffer.readUInt16LE(2)).toBe(1);
  const count = buffer.readUInt16LE(4);
  const sizes: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const entry = 6 + index * 16;
    const width = buffer.readUInt8(entry) || 256;
    const height = buffer.readUInt8(entry + 1) || 256;
    const length = buffer.readUInt32LE(entry + 8);
    const offset = buffer.readUInt32LE(entry + 12);
    expect(buffer.subarray(offset, offset + 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(length).toBeGreaterThan(8);
    sizes.push(`${width}x${height}`);
  }
  return sizes;
}

describe("concept 3 brand assets", () => {
  it("uses the chosen mark in the app icon and the in-app logo", () => {
    const svg = read("src/app/icon.svg").toString("utf8");
    const logo = read("src/components/brand/logo.tsx").toString("utf8");
    for (const fragment of [
      "#171717",
      "#FAFAFA",
      "#F59E0B",
      "M40 26V40A10.5 10.5 0 0 1 19 40",
      "M28 27L40 11L52 27Z",
    ]) {
      expect(svg).toContain(fragment);
      expect(logo).toContain(fragment);
    }
    expect(logo).not.toContain("Inter");
    expect(logo).toContain("Job Search");
    expect(logo).toContain("Assistant");
  });

  it("publishes favicon, apple touch, and manifest icons", () => {
    expect(icoSizes(read("src/app/favicon.ico"))).toEqual(["16x16", "32x32", "48x48"]);
    expect(pngSize(read("src/app/apple-icon.png"))).toEqual({ width: 180, height: 180 });
    expect(pngSize(read("public/icons/icon-192.png"))).toEqual({ width: 192, height: 192 });
    expect(pngSize(read("public/icons/icon-512.png"))).toEqual({ width: 512, height: 512 });
    expect(pngSize(read("src/app/opengraph-image.png"))).toEqual({ width: 1200, height: 630 });
    const manifest = read("src/app/manifest.ts").toString("utf8");
    expect(manifest).toContain("/icons/icon-192.png");
    expect(manifest).toContain("/icons/icon-512.png");
    expect(manifest).toContain("Job Search Assistant");
  });

  it("replaces the extension icons and bumps the version", () => {
    const manifest = JSON.parse(read("extension/public/manifest.json").toString("utf8")) as {
      version: string;
      icons: Record<string, string>;
      action: { default_icon: Record<string, string> };
    };
    expect(manifest.version).toBe("0.2.1");
    expect(manifest.icons).toEqual({
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png",
    });
    expect(manifest.action.default_icon["32"]).toBe("icons/icon32.png");
    expect(pngSize(read("extension/public/icons/icon16.png"))).toEqual({ width: 16, height: 16 });
    expect(pngSize(read("extension/public/icons/icon32.png"))).toEqual({ width: 32, height: 32 });
    expect(pngSize(read("extension/public/icons/icon48.png"))).toEqual({ width: 48, height: 48 });
    expect(pngSize(read("extension/public/icons/icon128.png"))).toEqual({ width: 128, height: 128 });
    expect(JSON.parse(read("extension/package.json").toString("utf8")).version).toBe("0.2.1");
  });
});

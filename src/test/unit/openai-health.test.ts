import { afterEach, describe, expect, it, vi } from "vitest";
import { checkOpenAiHealth } from "@/modules/ai/openai-health";

const listMock = vi.hoisted(() => vi.fn());

vi.mock("openai", () => ({
  default: class OpenAI {
    models = { list: listMock };
  },
}));

describe("OpenAI health check", () => {
  const original = process.env.OPENAI_API_KEY;

  afterEach(() => {
    listMock.mockReset();
    if (original === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original;
  });

  it("reports a missing key without calling OpenAI", async () => {
    delete process.env.OPENAI_API_KEY;
    const report = await checkOpenAiHealth();
    expect(report).toMatchObject({ configured: false, ok: false, reason: "no_key" });
    expect(report.detail).not.toMatch(/sk-/);
    expect(listMock).not.toHaveBeenCalled();
  });

  it("reports success without echoing the key", async () => {
    process.env.OPENAI_API_KEY = "sk-test-health-key";
    listMock.mockResolvedValue({ data: [{ id: "gpt-4o-mini" }] });
    const report = await checkOpenAiHealth();
    expect(report).toMatchObject({ configured: true, ok: true, reason: "ok" });
    expect(JSON.stringify(report)).not.toContain("sk-test-health-key");
  });

  it("names a format, placeholder, or wrapper gate without showing the key", async () => {
    process.env.OPENAI_API_KEY = "not-a-real-key";
    const format = await checkOpenAiHealth();
    expect(format.detail).toMatch(/doesn't start with sk-/);
    expect(format.detail).not.toContain("not-a-real-key");

    process.env.OPENAI_API_KEY = "placeholder-key";
    const placeholder = await checkOpenAiHealth();
    expect(placeholder.detail).toMatch(/looks like a placeholder/);
    expect(placeholder.detail).not.toContain("placeholder-key");

    process.env.OPENAI_API_KEY = '"not-a-real-key"';
    const wrapped = await checkOpenAiHealth();
    expect(wrapped.detail).toMatch(/surrounding quotes or whitespace/);
    expect(wrapped.detail).not.toContain("not-a-real-key");
    expect(listMock).not.toHaveBeenCalled();
  });

  it("accepts a quoted key after trimming", async () => {
    process.env.OPENAI_API_KEY = '"sk-quoted-health-key"';
    listMock.mockResolvedValue({ data: [] });
    const report = await checkOpenAiHealth();
    expect(report).toMatchObject({ configured: true, ok: true, reason: "ok" });
    expect(JSON.stringify(report)).not.toContain("sk-quoted-health-key");
  });

  it("redacts the key from an error", async () => {
    process.env.OPENAI_API_KEY = "sk-test-health-key";
    listMock.mockRejectedValue(new Error("Unauthorized sk-test-health-key"));
    const report = await checkOpenAiHealth();
    expect(report.ok).toBe(false);
    expect(report.reason).toBe("error");
    expect(report.detail).not.toContain("sk-test-health-key");
    expect(report.detail).toContain("[redacted]");
  });
});
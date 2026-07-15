import { test, expect } from "@playwright/test";

test.describe("Job detail trust flow", () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.E2E_TEST_EMAIL;
    const password = process.env.E2E_TEST_PASSWORD;
    test.skip(!email || !password, "Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD for full E2E");

    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL(/\/(jobs|dashboard|onboarding|profile)/);
  });

  test("import → match tab → Q&A draft persists on reload", async ({ page }) => {
    const jobDescription = [
      "Title: Senior Frontend Engineer",
      "Company: Phase4 Test Corp",
      "Location: Remote - Canada",
      "We are looking for a Senior Frontend Engineer with React and TypeScript experience.",
      "Required: 5+ years React",
      "Required: TypeScript",
      "Preferred: Next.js",
    ].join("\n");

    await page.goto("/jobs/import");
    await page.getByPlaceholder("Paste the full job description...").fill(jobDescription);
    await page.getByRole("button", { name: "Preview Import" }).click();
    await page.getByRole("heading", { name: "Review Import" }).waitFor();
    await page.getByRole("button", { name: "Save & Match" }).click();
    await page.waitForURL(/\/jobs\/[a-f0-9-]+$/);

    await page.getByRole("tab", { name: "Match" }).click();
    await expect(page.getByText(/Overall match|Extraction confidence/i).first()).toBeVisible();

    await page.getByRole("tab", { name: "Evidence" }).click();
    await expect(page.getByText(/Job requirement/i).first()).toBeVisible();

    await page.getByRole("tab", { name: "Application Q&A" }).click();
    await page.getByRole("button", { name: "Draft Answer" }).click();
    await expect(page.getByLabel("Draft (review and edit before submitting)")).not.toHaveValue("");

    const draftText = await page
      .getByLabel("Draft (review and edit before submitting)")
      .inputValue();
    expect(draftText.length).toBeGreaterThan(10);

    await page.reload();
    await page.getByRole("tab", { name: "Application Q&A" }).click();
    await expect(page.getByLabel("Draft (review and edit before submitting)")).toHaveValue(
      draftText
    );
  });
});

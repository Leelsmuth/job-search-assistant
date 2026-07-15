import { test, expect } from "@playwright/test";

test.describe("Job Search Assistant E2E", () => {
  test("login page renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Job Search Assistant" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("unauthenticated user redirects to login", async ({ page }) => {
    await page.goto("/jobs");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Authenticated happy path", () => {
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

  test("import paste → feed → save → update status", async ({ page }) => {
    const jobDescription = [
      "Title: Senior Frontend Engineer",
      "Company: Acme Corp",
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

    await page.goto("/jobs");
    await expect(page.getByText("Senior Frontend Engineer").first()).toBeVisible();

    await page.getByText("Senior Frontend Engineer").first().click();
    await page.getByRole("button", { name: /save/i }).click();

    await page.goto("/applications");
    await expect(page.getByText("Senior Frontend Engineer")).toBeVisible();

    const statusSelect = page.locator("select").first();
    await statusSelect.selectOption("preparing");
    await expect(statusSelect).toHaveValue("preparing");
  });
});

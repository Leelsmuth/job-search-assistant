import { test, expect, type Page } from "@playwright/test";
import { DEMO_ACTIVE_KEY, DEMO_STORAGE_KEY } from "@/modules/demo/storage-keys";
import { createDemoState, saveDemoJob, type DemoState } from "@/modules/demo/demo-state";

/**
 * The public demo needs no account, Supabase, or Postgres, so these tests run
 * against a bare `pnpm dev` with no env vars.
 */

const JOB = "Senior Frontend Engineer at Northwind Labs";

function visible(page: Page, selector: string) {
  // The tracker list renders a card layout (mobile) and a table (desktop); only one is visible.
  return page.locator(`${selector}:visible`);
}

async function storeDemoState(page: Page, state: DemoState) {
  await page.evaluate(
    ([key, value]) => window.localStorage.setItem(key, value),
    [DEMO_STORAGE_KEY, JSON.stringify(state)] as const
  );
}

async function readSeededAt(page: Page): Promise<string> {
  return page.evaluate(
    (key) => JSON.parse(window.localStorage.getItem(key) ?? "{}").seededAt,
    DEMO_STORAGE_KEY
  );
}

function statusSelect(page: Page, subject = JOB) {
  return visible(page, `select[aria-label="Status for ${subject}"]`);
}

test.describe("public demo", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
  });

  test("landing page leads into the demo without signing in", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();

    await page.getByRole("link", { name: "Try the demo" }).click();
    await expect(page).toHaveURL(/\/demo$/);
    await expect(page.getByRole("heading", { name: "Job Feed" })).toBeVisible();
    await expect(page.getByText("Demo mode.", { exact: true })).toBeVisible();
  });

  test.describe("landing page call to action", () => {
    const TRY = "Try the demo";
    const CONTINUE = "Continue exploring your demo";

    async function landingCta(page: Page) {
      const tryLink = page.getByRole("link", { name: TRY });
      const continueLink = page.getByRole("link", { name: CONTINUE });
      await expect(tryLink.or(continueLink)).toBeVisible();
      if (await continueLink.isVisible()) {
        await expect(tryLink).toHaveCount(0);
        return "continue";
      }
      await expect(continueLink).toHaveCount(0);
      return "try";
    }

    /** Load the landing page without Next's JavaScript: only HTML, CSS, and the inline script run. */
    async function firstPaintCta(page: Page) {
      await page.route("**/_next/static/chunks/**", (route) => route.abort());
      await page.goto("/");
      const cta = await landingCta(page);
      await page.unroute("**/_next/static/chunks/**");
      return cta;
    }

    test("new visitors see Try the demo, and the landing page creates no demo", async ({ page }) => {
      await page.goto("/");
      expect(await landingCta(page)).toBe("try");
      expect(await firstPaintCta(page)).toBe("try");
      const stored = await page.evaluate((key) => window.localStorage.getItem(key), DEMO_STORAGE_KEY);
      expect(stored).toBeNull();
    });

    test("visitors with demo changes are invited to continue, from the first paint", async ({ page }) => {
      await page.goto("/demo");
      // Opening the demo alone is not "in progress".
      await page.getByRole("link", { name: "Job Search Assistant home" }).click();
      expect(await landingCta(page)).toBe("try");

      await page.goto("/demo");
      await page.getByRole("button", { name: `Save ${JOB}` }).click();

      // Client-side navigation back to the landing page.
      await page.getByRole("link", { name: "Job Search Assistant home" }).click();
      await expect(page).toHaveURL(/\/$/);
      expect(await landingCta(page)).toBe("continue");
      await expect(page.getByText("Welcome back.", { exact: false })).toBeVisible();

      // A full load shows the right copy before any JavaScript bundle runs.
      expect(await firstPaintCta(page)).toBe("continue");
      await page.reload();
      expect(await landingCta(page)).toBe("continue");

      await page.getByRole("link", { name: CONTINUE }).click();
      await expect(page.getByRole("button", { name: `Unsave ${JOB}` })).toBeVisible();
    });

    test("resetting the demo brings back Try the demo", async ({ page }) => {
      await page.goto("/demo");
      await page.getByRole("button", { name: `Save ${JOB}` }).click();
      await page.getByRole("button", { name: "Reset demo" }).click();
      await page.getByRole("link", { name: "Job Search Assistant home" }).click();
      expect(await landingCta(page)).toBe("try");
      expect(await firstPaintCta(page)).toBe("try");
    });

    test("a missing marker is repaired the next time the demo opens", async ({ page }) => {
      // Changes saved without the marker, e.g. by an older build or a hand edit.
      await storeDemoState(page, saveDemoJob(createDemoState(), "northwind-senior-frontend"));
      await page.goto("/");
      expect(await landingCta(page)).toBe("try");

      await page.goto("/demo");
      await expect(page.getByRole("button", { name: `Unsave ${JOB}` })).toBeVisible();
      expect(
        await page.evaluate((key) => window.localStorage.getItem(key), DEMO_ACTIVE_KEY)
      ).toBe("1");
      expect(await firstPaintCta(page)).toBe("continue");
    });
  });

  test("save a job, see it in the tracker, move it to applied, then reset", async ({ page }) => {
    await page.goto("/demo");

    // Save from the feed.
    const save = page.getByRole("button", { name: `Save ${JOB}` });
    await save.click();
    await expect(page.getByRole("button", { name: `Unsave ${JOB}` })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByText("Added to your applications as Saved.", { exact: true })).toBeVisible();

    // It shows up in the tracker as Saved, next to the two seeded applications.
    await page.getByRole("navigation", { name: "Demo" }).getByRole("link", { name: /Applications/ }).click();
    await expect(page).toHaveURL(/\/demo\/applications$/);
    await expect(page.getByText("3 logged")).toBeVisible();
    await expect(statusSelect(page)).toHaveValue("saved");

    // Move it to Applied; the applied date is stamped.
    await statusSelect(page).selectOption("applied");
    await expect(page.getByText("Status updated", { exact: true })).toBeVisible();
    const filters = page.getByRole("navigation", { name: "Filter by status" });
    await expect(filters.getByRole("link", { name: "Applied 2" })).toBeVisible();

    // Survives a reload.
    await page.reload();
    await expect(statusSelect(page)).toHaveValue("applied");

    // Board view puts it in the Applied column.
    await page.getByRole("link", { name: "Board", exact: true }).click();
    const appliedColumn = page.getByRole("region", { name: /^Applied \(/ });
    await expect(appliedColumn.getByRole("link", { name: "Senior Frontend Engineer" })).toBeVisible();

    // Reset clears it; Undo brings it back; reset again sticks.
    await page.getByRole("button", { name: "Reset demo" }).click();
    await expect(page.getByText("2 logged")).toBeVisible();
    await expect(statusSelect(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("3 logged")).toBeVisible();

    await page.getByRole("button", { name: "Reset demo" }).click();
    await expect(page.getByText("2 logged")).toBeVisible();
    await page.reload();
    await expect(page.getByText("2 logged")).toBeVisible();
  });

  test("reset is only offered once something has changed", async ({ page }) => {
    await page.goto("/demo");
    const reset = page.getByRole("button", { name: "Reset demo" });

    // Fresh demo: nothing to reset, and no toast.
    await expect(reset).toBeDisabled();
    await reset.click({ force: true });
    await expect(page.getByText("Demo reset", { exact: true })).toHaveCount(0);

    // A change enables it; resetting disables it again.
    await page.getByRole("button", { name: `Save ${JOB}` }).click();
    await expect(reset).toBeEnabled();
    await reset.click();
    await expect(page.getByText("Demo reset", { exact: true })).toBeVisible();
    await expect(reset).toBeDisabled();

    // Undo restores the change, so reset is available again.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("button", { name: `Unsave ${JOB}` })).toBeVisible();
    await expect(reset).toBeEnabled();

    // Dismissing and restoring the same job leaves nothing to reset.
    await page.getByRole("button", { name: `Unsave ${JOB}` }).click();
    await reset.click();
    await expect(reset).toBeDisabled();
    await page.getByRole("button", { name: `Dismiss ${JOB}` }).click();
    await expect(reset).toBeEnabled();
    await page.getByRole("button", { name: "Show dismissed (1)" }).click();
    await page.getByRole("button", { name: `Restore ${JOB}` }).click();
    await expect(reset).toBeDisabled();
  });

  test("an untouched demo from days ago comes back with fresh dates", async ({ page }) => {
    const threeDaysAgo = createDemoState(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
    await storeDemoState(page, threeDaysAgo);

    await page.goto("/demo");
    const northwind = page.getByRole("listitem").filter({ hasText: "Northwind Labs" });
    await expect(northwind.getByText("Posted 5h ago")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset demo" })).toBeDisabled();
    expect(Date.parse(await readSeededAt(page))).toBeGreaterThan(Date.parse(threeDaysAgo.seededAt));
  });

  test("a changed demo from days ago is kept as it was", async ({ page }) => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const changed = saveDemoJob(createDemoState(threeDaysAgo), "northwind-senior-frontend", threeDaysAgo);
    await storeDemoState(page, changed);

    await page.goto("/demo");
    const northwind = page.getByRole("listitem").filter({ hasText: "Northwind Labs" });
    await expect(northwind.getByText("Posted 3d ago")).toBeVisible();
    await expect(page.getByRole("button", { name: `Unsave ${JOB}` })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset demo" })).toBeEnabled();
    expect(await readSeededAt(page)).toBe(changed.seededAt);

    // Reset is how the visitor gets fresh dates here.
    await page.getByRole("button", { name: "Reset demo" }).click();
    await expect(northwind.getByText("Posted 5h ago")).toBeVisible();
  });

  test("dismiss and undo from the feed", async ({ page }) => {
    await page.goto("/demo");
    await page.getByRole("button", { name: `Dismiss ${JOB}` }).click();
    await expect(page.getByRole("button", { name: `Save ${JOB}` })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Show dismissed (1)" })).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByRole("button", { name: `Save ${JOB}` })).toBeVisible();
  });

  test("job page saves and tracks the role", async ({ page }) => {
    await page.goto("/demo");
    await page.getByRole("link", { name: /Senior Frontend Engineer/ }).first().click();
    await expect(page.getByRole("heading", { name: "Senior Frontend Engineer" })).toBeVisible();
    await expect(page.getByText("Why it matches")).toBeVisible();

    await page.getByRole("button", { name: `Save ${JOB}` }).click();
    await statusSelect(page).selectOption("interviewing");
    await expect(page.getByText("Status updated", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Open the tracker" }).click();
    await expect(statusSelect(page)).toHaveValue("interviewing");
  });

  test("the signed-in app stays behind sign-in", async ({ page }) => {
    await page.goto("/applications");
    await expect(page).toHaveURL(/\/login/);
  });
});

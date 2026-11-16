import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { DEMO_ACTIVE_KEY, DEMO_STORAGE_KEY } from "@/modules/demo/storage-keys";
import { createDemoState, saveDemoJob, type DemoState } from "@/modules/demo/demo-state";
import { DEMO_LIVE_JOBS_ENDPOINT, type DemoLiveBatch } from "@/modules/demo/live-jobs";

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

test.describe("live jobs in the demo", () => {
  const LIVE_JOB = "Frontend Engineer, Admin Console at Tailscale";
  const LIVE_URL = "https://job-boards.greenhouse.io/tailscale/jobs/4103";

  function liveBatch(source: DemoLiveBatch["source"] = "live"): DemoLiveBatch {
    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    return {
      source,
      companyName: "Tailscale",
      providerLabel: "Greenhouse",
      boardUrl: "https://boards.greenhouse.io/tailscale",
      fetchedAt: new Date().toISOString(),
      totalOpenings: 38,
      jobs: [
        {
          id: "gh-4103",
          title: "Frontend Engineer, Admin Console",
          company: "Tailscale",
          location: "Remote - Canada",
          workplaceType: "remote",
          url: LIVE_URL,
          postedAt: hoursAgo(3),
        },
        {
          id: "gh-4104",
          title: "Software Engineer, Networking",
          company: "Tailscale",
          location: "Toronto, ON (Hybrid)",
          workplaceType: "hybrid",
          url: "https://job-boards.greenhouse.io/tailscale/jobs/4104",
          postedAt: hoursAgo(50),
        },
        {
          id: "gh-4106",
          title: "Product Designer",
          company: "Tailscale",
          location: null,
          workplaceType: null,
          url: "https://job-boards.greenhouse.io/tailscale/jobs/4106",
          postedAt: null,
        },
      ],
    };
  }

  /** Answer the live jobs endpoint from the test, so nothing depends on Greenhouse. */
  async function mockLiveJobs(page: Page, responses: Array<"ok" | "snapshot" | "fail"> = ["ok"]) {
    const calls = { count: 0 };
    await page.context().route(`**${DEMO_LIVE_JOBS_ENDPOINT}`, (route) => {
      const kind = responses[Math.min(calls.count, responses.length - 1)];
      calls.count += 1;
      if (kind === "fail") {
        return route.fulfill({ status: 502, json: { error: "Live jobs are unavailable right now." } });
      }
      return route.fulfill({ json: liveBatch(kind === "snapshot" ? "snapshot" : "live") });
    });
    return calls;
  }

  function liveList(page: Page) {
    return page.getByRole("list", { name: "Live jobs" });
  }

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
  });

  test("loads a batch next to the sample jobs, clearly marked as live", async ({ page }) => {
    const calls = await mockLiveJobs(page);
    await page.goto("/demo");

    // Nothing is fetched until the visitor asks.
    await expect(page.getByRole("heading", { name: "See real openings" })).toBeVisible();
    expect(calls.count).toBe(0);

    await page.getByRole("button", { name: "Load live jobs" }).click();
    await expect(page.getByRole("heading", { name: /Live jobs from Tailscale/ })).toBeVisible();
    await expect(liveList(page).getByRole("listitem")).toHaveCount(3);
    await expect(page.getByText("Showing 3 of 38 openings.", { exact: false })).toBeVisible();

    // Live rows carry a Live label and no fit score; sample jobs are listed separately.
    const liveRow = liveList(page).getByRole("listitem").filter({ hasText: "Admin Console" });
    await expect(liveRow.getByText("Live", { exact: true })).toBeVisible();
    await expect(liveRow.getByText("Posted 3h ago")).toBeVisible();
    await expect(liveRow.getByText("fit", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Sample jobs" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Sample jobs" }).getByText("Northwind Labs")).toBeVisible();
    await expect(liveList(page).getByText("Northwind Labs")).toHaveCount(0);

    // The posting opens on the employer's site in a new tab.
    const open = liveRow.getByRole("link", { name: `Open posting: ${LIVE_JOB} (opens in a new tab)` });
    await expect(open).toHaveAttribute("href", LIVE_URL);
    await expect(open).toHaveAttribute("target", "_blank");
    await expect(open).toHaveAttribute("rel", "noopener noreferrer");

    // Feed filters apply to live jobs too.
    const search = page.getByRole("searchbox", { name: "Search" });
    await search.fill("networking");
    await expect(liveList(page).getByRole("listitem")).toHaveCount(1);
    await search.fill("");
    await page.getByLabel("Workplace").selectOption("hybrid");
    await expect(liveList(page).getByRole("listitem")).toHaveCount(1);
    await page.getByLabel("Workplace").selectOption("on_site");
    await expect(page.getByText("No live jobs match these filters.")).toBeVisible();
  });

  test("saving a live job asks the visitor to sign up or sign in", async ({ page }) => {
    await mockLiveJobs(page);
    await page.goto("/demo");
    await page.getByRole("button", { name: "Load live jobs" }).click();

    const save = page.getByRole("button", { name: `Save ${LIVE_JOB}` });
    await save.click();
    const dialog = page.getByRole("dialog", { name: "Save real jobs to your own tracker" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(`${LIVE_JOB}`, { exact: false })).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/login?mode=signup"
    );
    await expect(dialog.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    await expect(dialog.getByRole("link", { name: /read the posting/ })).toHaveAttribute("href", LIVE_URL);

    // Closing returns to the feed, with focus back on the Save button.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(save).toBeFocused();
    await save.click();
    await dialog.getByRole("button", { name: "Keep exploring the demo" }).click();
    await expect(dialog).toHaveCount(0);

    // Nothing was saved: the demo tracker and Reset are untouched.
    const nav = page.getByRole("navigation", { name: "Demo" });
    await expect(nav.getByRole("link", { name: /Applications\s*2/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset demo" })).toBeDisabled();

    // Create an account opens the login page in sign-up mode.
    await save.click();
    await dialog.getByRole("link", { name: "Create an account" }).click();
    await expect(page).toHaveURL(/\/login\?mode=signup$/);
    await expect(page.getByRole("button", { name: "Sign Up" })).toBeVisible();
  });

  test("live jobs last for the current tab only", async ({ page, context }) => {
    const calls = await mockLiveJobs(page);
    await page.goto("/demo");
    await page.getByRole("button", { name: "Load live jobs" }).click();
    await expect(liveList(page).getByRole("listitem")).toHaveCount(3);

    // Kept across a reload and demo navigation, without fetching again.
    await page.reload();
    await expect(liveList(page).getByRole("listitem")).toHaveCount(3);
    await page.getByRole("navigation", { name: "Demo" }).getByRole("link", { name: /Applications/ }).click();
    await expect(page).toHaveURL(/\/demo\/applications$/);
    await page.getByRole("navigation", { name: "Demo" }).getByRole("link", { name: "Job feed" }).click();
    await expect(liveList(page).getByRole("listitem")).toHaveCount(3);
    expect(calls.count).toBe(1);

    // A new tab starts without them.
    const otherTab = await context.newPage();
    await otherTab.goto("/demo");
    await expect(otherTab.getByRole("button", { name: "Load live jobs" })).toBeVisible();
    await expect(otherTab.getByRole("list", { name: "Live jobs" })).toHaveCount(0);
    await otherTab.close();

    // Loading live jobs is not a demo change, so the landing page still says "Try the demo".
    await page.getByRole("link", { name: "Job Search Assistant home" }).click();
    await expect(page.getByRole("link", { name: "Try the demo" })).toBeVisible();

    // Hiding them sticks for the tab.
    await page.goto("/demo");
    await page.getByRole("button", { name: "Hide live jobs" }).click();
    await expect(page.getByRole("button", { name: "Load live jobs" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Load live jobs" })).toBeVisible();
  });

  test("a development snapshot is labelled as a snapshot, never as live", async ({ page }) => {
    await mockLiveJobs(page, ["snapshot"]);
    await page.goto("/demo");
    await page.getByRole("button", { name: "Load live jobs" }).click();

    await expect(page.getByRole("heading", { name: /Snapshot jobs from Tailscale/ })).toBeVisible();
    await expect(page.getByRole("note")).toContainText("Development snapshot, not live data.");
    const list = page.getByRole("list", { name: "Snapshot jobs" });
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await expect(list.getByText("Snapshot", { exact: true })).toHaveCount(3);
    await expect(page.getByText("Live", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Live jobs" })).toHaveCount(0);
  });

  test("a failed load explains itself and can be retried", async ({ page }) => {
    await mockLiveJobs(page, ["fail", "ok"]);
    await page.goto("/demo");
    await page.getByRole("button", { name: "Load live jobs" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Live jobs are unavailable" })).toBeVisible();
    // The sample jobs keep working.
    await expect(page.getByRole("button", { name: `Save ${JOB}` })).toBeVisible();

    await page.getByRole("button", { name: "Try again" }).click();
    await expect(liveList(page).getByRole("listitem")).toHaveCount(3);
  });
});

test.describe("spreadsheet import and export in the demo tracker", () => {
  const SHEET = [
    "Company Name,Position,Current Status,Date Applied,Link,Comments,Salary",
    'Acme Robotics,Frontend Developer,Interview,03/14/2025,acme.example.com/jobs/1,"Met the team, liked them",120k',
    "Globex,Platform Engineer,Ghosted,03/20/2025,,,",
    "Initech,,Applied,,,,",
    // Already tracked in the seeded demo, with a new status.
    "Harbourline Logistics,Full-Stack Engineer (React/Node),Offer,,,,",
    // Repeats the first row.
    "acme robotics,Frontend developer,,,,,",
  ].join("\n");

  function csvFile(contents: string, name = "my-tracker.csv") {
    return { name, mimeType: "text/csv", buffer: Buffer.from(contents, "utf8") };
  }

  async function openImport(page: Page) {
    await page.goto("/demo/applications");
    await page.getByRole("button", { name: "Import CSV" }).click();
    return page.getByRole("dialog", { name: "Import applications from a spreadsheet" });
  }

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
  });

  test("choose a file, map columns, preview, resolve duplicates, confirm, and export", async ({ page }) => {
    const dialog = await openImport(page);
    await dialog.getByLabel("Choose a CSV file").setInputFiles(csvFile(SHEET));

    // Map: headers are matched automatically, and unmatched columns are listed.
    await expect(dialog.getByRole("heading", { name: "Match your columns" })).toBeFocused();
    await expect(dialog.getByLabel("Company *")).toHaveValue("0");
    await expect(dialog.getByLabel("Role *")).toHaveValue("1");
    await expect(dialog.getByLabel("Job URL")).toHaveValue("4");
    await expect(dialog.getByText("e.g. Met the team, liked them")).toBeVisible();
    await expect(dialog.locator("p", { hasText: "Not imported:" })).toContainText("Salary");

    // Company and role are required before moving on.
    await dialog.getByLabel("Role *").selectOption("");
    await expect(dialog.getByRole("button", { name: "Preview" })).toBeDisabled();
    await expect(dialog.getByText("Choose a column for Role to continue.")).toBeVisible();
    await dialog.getByLabel("Role *").selectOption("1");
    await dialog.getByRole("button", { name: "Preview" }).click();

    // Preview: every row, with what will be skipped and what was guessed.
    await expect(dialog.getByRole("heading", { name: "Preview your records" })).toBeFocused();
    const summary = dialog.getByRole("list", { name: "Preview summary" });
    await expect(summary).toContainText("3 ready");
    await expect(summary).toContainText("1 with notes");
    await expect(summary).toContainText("1 will be skipped");
    await expect(summary).toContainText("2 possible duplicates");
    await expect(dialog.getByText("Skipped: Missing role")).toBeVisible();
    await expect(dialog.getByText('Status "Ghosted" is not one we track, so it was imported as Applied')).toBeVisible();
    await dialog.getByRole("button", { name: "Review duplicates" }).click();

    // Duplicates: skipped unless the visitor chooses otherwise; update shows what changes.
    await expect(dialog.getByRole("heading", { name: "Decide what to do with duplicates" })).toBeFocused();
    const tracked = dialog.getByRole("group", { name: /Row 5: Full-Stack Engineer/ });
    await expect(tracked.getByText("tracked as Applied")).toBeVisible();
    await expect(tracked.getByRole("radio", { name: "Skip this row" })).toBeChecked();
    await tracked.getByRole("radio", { name: "Update the tracked application" }).check();
    await expect(tracked.getByText("Offer")).toBeVisible();
    const repeat = dialog.getByRole("group", { name: /Row 6: Frontend developer/ });
    await expect(repeat.getByText("Repeats row 2 of this file.")).toBeVisible();
    await expect(repeat.getByRole("radio", { name: "Update the tracked application" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Continue" }).click();

    // Confirm.
    await expect(dialog.getByText("2 new applications will be added")).toBeVisible();
    await expect(dialog.getByText("1 tracked application will be updated")).toBeVisible();
    await expect(dialog.getByText("1 duplicate will be skipped")).toBeVisible();
    await expect(dialog.getByText("1 row without a company or role will be skipped")).toBeVisible();
    await dialog.getByRole("button", { name: "Import 3 applications" }).click();

    // Done, with export right there.
    await expect(dialog.getByText("Done: added 2 applications and updated 1.")).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Export CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^job-applications-\d{4}-\d{2}-\d{2}\.csv$/);
    const exported = await readFile((await download.path())!, "utf8");
    expect(exported.charCodeAt(0)).toBe(0xfeff);
    expect(exported).toContain("Company,Role,Status,Date applied,Follow-up date,Location,Workplace,Job URL,Notes");
    expect(exported).toContain(
      'Acme Robotics,Frontend Developer,Interviewing,2025-03-14,,,,https://acme.example.com/jobs/1,"Met the team, liked them"'
    );
    expect(exported).toContain("Harbourline Logistics,Full-Stack Engineer (React/Node),Offer,");

    await dialog.getByRole("button", { name: "View tracker" }).click();
    await expect(dialog).toHaveCount(0);

    // The tracker shows imported rows like any other, and they survive a reload.
    await expect(page.getByText("4 logged")).toBeVisible();
    await page.reload();
    await expect(page.getByText(/^4 logged/)).toBeVisible();
    const acmeRow = page.getByRole("row").filter({ hasText: "Acme Robotics" });
    await expect(acmeRow.getByText("Frontend Developer")).toBeVisible();
    // No sample job page exists for imported rows, so the title is plain text and the link goes to the posting.
    await expect(acmeRow.getByRole("link", { name: "Frontend Developer" })).toHaveCount(0);
    await expect(acmeRow.getByRole("link", { name: "View job" })).toHaveCount(0);
    await expect(acmeRow.getByRole("link", { name: "Job posting" })).toHaveAttribute(
      "href",
      "https://acme.example.com/jobs/1"
    );
    await expect(statusSelect(page, "Frontend Developer at Acme Robotics")).toHaveValue("interviewing");
    await expect(statusSelect(page, "Full-Stack Engineer (React/Node) at Harbourline Logistics")).toHaveValue("offer");

    // Imported rows are edited in place like the rest.
    await statusSelect(page, "Platform Engineer at Globex").selectOption("rejected");
    await expect(page.getByText("Status updated", { exact: true })).toBeVisible();

    // Reset removes the import.
    await page.getByRole("button", { name: "Reset demo" }).click();
    await expect(page.getByText("2 logged")).toBeVisible();
  });

  test("undo puts the tracker back, and an export imports back cleanly", async ({ page }) => {
    const dialog = await openImport(page);
    await dialog
      .getByLabel("Choose a CSV file")
      .setInputFiles(csvFile("Company,Role,Status\nAcme Robotics,Frontend Developer,Applied\n"));
    await dialog.getByRole("button", { name: "Preview" }).click();
    await dialog.getByRole("button", { name: "Continue" }).click();
    await expect(dialog.getByText("No duplicates found")).toBeVisible();
    await expect(dialog.getByRole("list", { name: "Import steps" })).toContainText("Duplicates(none found)");
    await dialog.getByRole("button", { name: "Import 1 application" }).click();
    await dialog.getByRole("button", { name: "Undo import" }).click();
    await expect(page.getByText("Import undone", { exact: true })).toBeVisible();
    await expect(page.getByText("2 logged")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset demo" })).toBeDisabled();

    // Export the seeded tracker and import it straight back: everything is a duplicate.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export CSV" }).click(),
    ]);
    const exported = await readFile((await download.path())!, "utf8");
    await page.getByRole("button", { name: "Import CSV" }).click();
    await dialog.getByLabel("Choose a CSV file").setInputFiles(csvFile(exported, "export.csv"));
    await dialog.getByRole("button", { name: "Preview" }).click();
    await expect(dialog.getByRole("list", { name: "Preview summary" })).toContainText("2 possible duplicates");
    await dialog.getByRole("button", { name: "Review duplicates" }).click();
    await expect(dialog.getByText("2 rows match applications already in your tracker", { exact: false })).toBeVisible();
    await dialog.getByRole("button", { name: "Update", exact: true }).click();
    await expect(dialog.getByText("nothing would change")).toHaveCount(2);
    await dialog.getByRole("button", { name: "Continue" }).click();
    await dialog.getByRole("button", { name: "Import 2 applications" }).click();
    await expect(dialog.getByText("Nothing changed. 2 matches already had the same values.")).toBeVisible();
  });

  test("explains files it cannot import", async ({ page }) => {
    const dialog = await openImport(page);
    const input = dialog.getByLabel("Choose a CSV file");

    await input.setInputFiles({ name: "tracker.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("PK") });
    await expect(dialog.getByRole("alert")).toContainText("That is a spreadsheet file, not a CSV.");

    await input.setInputFiles(csvFile("Company,Role\n"));
    await expect(dialog.getByRole("alert")).toContainText("only has a header row");

    await input.setInputFiles(csvFile('Company,Role\n"Acme,Dev\n'));
    await expect(dialog.getByRole("alert")).toContainText("is never closed");

    // Nothing was imported, and focus goes back to the button that opened the dialog.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Import CSV" })).toBeFocused();
    await expect(page.getByText("2 logged")).toBeVisible();
  });

  test("asks about day and month order when the dates could be either", async ({ page }) => {
    const dialog = await openImport(page);
    await dialog
      .getByLabel("Choose a CSV file")
      .setInputFiles(csvFile("Company,Role,Applied\nAcme,Dev,03/04/2025\n"));
    const order = dialog.getByLabel("Dates written with numbers, like 03/04/2025, are");
    await expect(order).toHaveValue("mdy");
    await expect(dialog.getByText("could be read either way")).toBeVisible();
    await order.selectOption("dmy");
    await dialog.getByRole("button", { name: "Preview" }).click();
    await expect(dialog.getByRole("cell", { name: "Apr 3, 2025" })).toBeVisible();
  });

  test("fills a phone screen, with one scroll area and no sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    const dialog = await openImport(page);
    await expect(dialog).toHaveJSProperty("offsetWidth", 360);
    await expect(dialog).toHaveJSProperty("offsetHeight", 640);
    await dialog.getByLabel("Choose a CSV file").setInputFiles("src/test/fixtures/tracker-import/job-tracker.csv");

    /** Elements inside the dialog that scroll, and whether any scrolls sideways. */
    const scrolling = () =>
      dialog.evaluate((root) => {
        const scrollers = [root, ...root.querySelectorAll("*")].filter((el) => {
          const style = getComputedStyle(el);
          return /(auto|scroll)/.test(style.overflowY + style.overflowX) && el.scrollHeight > el.clientHeight;
        });
        const sideways = [root, ...root.querySelectorAll("*")].some(
          (el) => /(auto|scroll)/.test(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth
        );
        return { scrollers: scrollers.length, sideways };
      });

    await expect(dialog.getByRole("heading", { name: "Match your columns" })).toBeVisible();
    expect(await scrolling()).toEqual({ scrollers: 1, sideways: false });

    // The preview is a list of cards on small screens, not a wide table.
    await dialog.getByRole("button", { name: "Preview" }).click();
    await expect(dialog.getByRole("list", { name: "Rows from job-tracker.csv" })).toBeVisible();
    await expect(dialog.getByRole("table")).toHaveCount(0);
    expect(await scrolling()).toEqual({ scrollers: 1, sideways: false });

    // Back and Next share one row, so the steps keep most of the screen.
    const back = await dialog.getByRole("button", { name: "Back" }).boundingBox();
    const next = await dialog.getByRole("button", { name: "Review duplicates" }).boundingBox();
    expect(back!.y).toBe(next!.y);
  });

  test("keeps the preview's column headers in view while scrolling on wide screens", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const dialog = await openImport(page);
    await dialog.getByLabel("Choose a CSV file").setInputFiles("src/test/fixtures/tracker-import/job-tracker.csv");
    await dialog.getByRole("button", { name: "Preview" }).click();
    const header = dialog.getByRole("columnheader", { name: "Company" });
    const body = header.locator("xpath=ancestor::div[contains(@class, 'overflow-y-auto')]");
    await body.evaluate((el) => el.scrollBy(0, 400));
    await expect
      .poll(async () => Math.round((await header.boundingBox())!.y - (await body.boundingBox())!.y))
      .toBe(0);
  });

  test("fix problem rows in the preview before importing", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const dialog = await openImport(page);
    await dialog.getByLabel("Choose a CSV file").setInputFiles("src/test/fixtures/tracker-import/job-tracker.csv");
    await dialog.getByRole("button", { name: "Preview" }).click();
    const summary = dialog.getByRole("list", { name: "Preview summary" });
    await expect(summary).toHaveText(/12 ready.*2 with notes.*2 will be skipped/);

    // Row 16 has no role. Fix opens the editor at the missing field.
    await dialog.getByRole("button", { name: "Fix row 16" }).click();
    const row16 = dialog.getByRole("group", { name: "Edit row 16" });
    await expect(row16.getByRole("status")).toHaveText("Row 16: Will be skipped: Missing role.");
    await expect(row16.getByLabel("Role *")).toBeFocused();
    await row16.getByLabel("Role *").fill("Brand Designer");
    // Checked again as you type, and the summary follows.
    await expect(row16.getByRole("status")).toHaveText("Row 16: Ready to import.");
    await expect(summary).toHaveText(/13 ready.*2 with notes.*1 will be skipped.*1 row edited/);
    await row16.getByRole("button", { name: "Done" }).click();
    await expect(row16).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Edit row 16" })).toBeFocused();

    // Clicking a cell opens the editor at that field. Row 9's status "Ghosted" is shown as the file wrote it.
    await dialog.getByRole("row").filter({ hasText: "Pinecrest Media" }).getByRole("cell", { name: "Applied", exact: true }).click();
    const row9 = dialog.getByRole("group", { name: "Edit row 9" });
    const status = row9.getByLabel("Status");
    await expect(status).toBeFocused();
    await expect(status.locator("option:checked")).toHaveText("“Ghosted” (not recognized)");
    await status.selectOption("rejected");
    await expect(row9.getByRole("status")).toHaveText("Row 9: Ready to import.");
    // Escape closes the editor, not the import.
    await page.keyboard.press("Escape");
    await expect(row9).toHaveCount(0);
    await expect(dialog).toBeVisible();

    // With a row open, clicking another of its cells moves to that field.
    const saltmarshRow = dialog.getByRole("row").filter({ hasText: "Saltmarsh Energy" });
    await saltmarshRow.getByRole("cell", { name: "Saltmarsh Energy" }).click();
    await expect(dialog.getByRole("group", { name: "Edit row 10" }).getByLabel("Company *")).toBeFocused();
    await saltmarshRow.getByRole("cell", { name: "Halifax, NS" }).click();
    await expect(dialog.getByRole("group", { name: "Edit row 10" }).getByLabel("Location")).toBeFocused();
    await page.keyboard.press("Escape");

    // Row 10 has three unreadable values. Fixing them one by one, with the filter on, keeps the row in view.
    await dialog.getByLabel(/Only show rows with notes or problems/).check();
    await dialog.getByRole("button", { name: "Fix row 10" }).click();
    const row10 = dialog.getByRole("group", { name: "Edit row 10" });
    await expect(row10.getByRole("status")).toHaveText("Row 10: Will import, with 3 notes below.");
    await expect(row10.getByLabel("Date applied")).toBeFocused();
    await row10.getByLabel("Date applied").fill("2025-04-01");
    await row10.getByLabel("Workplace").selectOption("hybrid");
    await row10.getByLabel("Job URL").fill("");
    await expect(row10.getByRole("status")).toHaveText("Row 10: Ready to import.");
    await row10.getByRole("button", { name: "Done" }).click();
    await expect(dialog.getByRole("row").filter({ hasText: "Saltmarsh Energy" })).toBeVisible();

    // Undo puts a row back to what the file says.
    await dialog.getByRole("button", { name: "Fix row 17" }).click();
    const row17 = dialog.getByRole("group", { name: "Edit row 17" });
    await row17.getByLabel("Company *").fill("Temporary Co");
    await expect(row17.getByRole("status")).toHaveText("Row 17: Ready to import.");
    await row17.getByRole("button", { name: "Undo changes to this row" }).click();
    await expect(row17.getByLabel("Company *")).toHaveValue("");
    await expect(row17.getByRole("status")).toHaveText("Row 17: Will be skipped: Missing company.");
    await row17.getByRole("button", { name: "Done" }).click();

    await expect(summary).toHaveText(/15 ready.*1 will be skipped.*3 possible duplicates.*3 rows edited/);
    await dialog.getByRole("button", { name: "Review duplicates" }).click();
    await dialog.getByRole("button", { name: "Continue" }).click();
    await expect(dialog.getByText("3 rows edited in the preview")).toBeVisible();
    await expect(dialog.getByText("12 new applications will be added")).toBeVisible();
    await dialog.getByRole("button", { name: "Import 12 applications" }).click();
    await dialog.getByRole("button", { name: "View tracker" }).click();

    // The edited values are what reached the tracker.
    await expect(statusSelect(page, "Brand Designer at Harrow & Finch")).toHaveValue("applied");
    await expect(statusSelect(page, "Frontend Developer at Pinecrest Media")).toHaveValue("rejected");
    const saltmarsh = page.getByRole("row").filter({ hasText: "Saltmarsh Energy" });
    await expect(saltmarsh.getByText("Halifax, NS · Hybrid")).toBeVisible();
    await expect(saltmarsh.getByText("Apr 1, 2025")).toBeVisible();
  });

  test("tap a card to fix a row on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const dialog = await openImport(page);
    await dialog.getByLabel("Choose a CSV file").setInputFiles("src/test/fixtures/tracker-import/job-tracker.csv");
    await dialog.getByRole("button", { name: "Preview" }).click();
    await dialog.getByRole("listitem").filter({ hasText: "Row 17" }).getByText("Frontend Developer").click();
    const editor = dialog.getByRole("group", { name: "Edit row 17" });
    await expect(editor.getByLabel("Company *")).toBeFocused();
    await editor.getByLabel("Company *").fill("Northern Lights Co");
    await editor.getByLabel("Company *").press("Enter");
    await expect(editor).toHaveCount(0);
    const card = dialog.getByRole("listitem").filter({ hasText: "Row 17" });
    await expect(card).toContainText("Northern Lights Co");
    await expect(card).toContainText("edited");
    await expect(dialog.getByRole("list", { name: "Preview summary" })).toContainText("1 will be skipped");
  });

  test("export is unavailable when the tracker is empty", async ({ page }) => {
    await storeDemoState(page, { ...createDemoState(), applications: [], savedJobIds: [] });
    await page.goto("/demo/applications");
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeDisabled();
    await expect(page.getByText("or import the spreadsheet you already keep")).toBeVisible();
  });
});

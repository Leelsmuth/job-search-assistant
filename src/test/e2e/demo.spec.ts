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

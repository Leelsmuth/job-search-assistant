import { test, expect, type Page } from "@playwright/test";
import { DEMO_COMPARE_SESSION_KEY, DEMO_PRIORITIES_KEY } from "@/modules/demo/storage-keys";

/**
 * Comparing roles in the public demo feed. Like the other demo tests, these
 * run against a bare `pnpm dev` with no env vars.
 */

function sampleJob(page: Page, title: string) {
  return page
    .getByRole("list", { name: "Sample jobs" })
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

function tray(page: Page) {
  return page.getByRole("region", { name: /Compare roles/ });
}

function traySlots(page: Page) {
  return tray(page).getByRole("list", { name: "Roles to compare" }).getByRole("listitem");
}

function traySlot(page: Page, index: number) {
  return tray(page).locator(`[data-slot="${index}"]`);
}

/**
 * A real mouse drag from the job's title to the docked tray: onto the given
 * slot, or onto the tray's heading (outside the slots) for the first empty one.
 */
async function dragToCompare(page: Page, title: string, slot?: number) {
  const target =
    slot === undefined ? tray(page).getByRole("heading", { name: /Compare roles/ }) : traySlot(page, slot);
  await sampleJob(page, title).getByRole("heading", { name: title }).dragTo(target);
}

/** Each slot's job title, or null for an empty slot. */
function slotTitles(page: Page) {
  return tray(page)
    .locator("[data-slot]")
    .evaluateAll((slots) =>
      slots.map((slot) => (slot.hasAttribute("aria-hidden") ? null : slot.querySelector("p")!.textContent))
    );
}

test.describe("compare roles in the demo feed", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/demo");
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.reload();
    await expect(tray(page)).toBeVisible();
  });

  test("drag two to four jobs into the tray, then compare them side by side", async ({ page }) => {
    const compare = tray(page).getByRole("button", { name: /^Compare/ });
    await expect(compare).toBeDisabled();

    await dragToCompare(page, "Senior Frontend Engineer");
    await expect(traySlots(page)).toHaveCount(1);
    await expect(compare).toBeDisabled();
    await expect(tray(page).getByRole("status")).toHaveText(/Add one more role to compare/);

    await dragToCompare(page, "Frontend Developer, Design Systems");
    await dragToCompare(page, "Senior Software Engineer, Web Platform");
    await dragToCompare(page, "Staff Frontend Engineer");
    await expect(traySlots(page)).toHaveCount(4);

    // A fifth role is refused, with the reason.
    await dragToCompare(page, "Junior Frontend Developer");
    await expect(traySlots(page)).toHaveCount(4);
    await expect(tray(page).getByRole("status")).toHaveText(/Compare holds up to 4 roles/);

    await compare.click();
    const dialog = page.getByRole("dialog", { name: "Compare roles" });
    await expect(dialog.getByRole("columnheader")).toHaveText([
      /Senior Frontend Engineer/,
      /Frontend Developer, Design Systems/,
      /Senior Software Engineer, Web Platform/,
      /Staff Frontend Engineer/,
    ]);
    const fitRow = dialog.getByRole("row").filter({ has: page.getByRole("rowheader", { name: /^Fit/ }) });
    await expect(fitRow.getByRole("cell").first()).toContainText("Best fit");
    const salaryRow = dialog
      .getByRole("row")
      .filter({ has: page.getByRole("rowheader", { name: /^Salary/ }) });
    await expect(salaryRow.getByRole("rowheader")).toContainText("CAD and USD, so not ranked");

    // Escape closes the comparison and returns focus to the tray's Compare button.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(compare).toBeFocused();
  });

  test("a job lands in the slot it is dropped on, and can be moved between slots", async ({ page }) => {
    await dragToCompare(page, "Senior Frontend Engineer", 2);
    await expect.poll(() => slotTitles(page)).toEqual([null, null, "Senior Frontend Engineer", null]);

    // Onto a taken slot: the job lands there and the one in the way makes room.
    await dragToCompare(page, "Staff Frontend Engineer", 2);
    await expect.poll(() => slotTitles(page)).toEqual([null, null, "Staff Frontend Engineer", "Senior Frontend Engineer"]);
    await expect(tray(page).getByRole("status")).toContainText("Senior Frontend Engineer moved over to make room");

    // Drag a slot to reorder.
    await traySlot(page, 3).dragTo(traySlot(page, 0));
    await expect.poll(() => slotTitles(page)).toEqual(["Senior Frontend Engineer", null, "Staff Frontend Engineer", null]);

    // The comparison follows the slots, and the positions survive a reload.
    await page.reload();
    await expect.poll(() => slotTitles(page)).toEqual(["Senior Frontend Engineer", null, "Staff Frontend Engineer", null]);
    await tray(page).getByRole("button", { name: /^Compare/ }).click();
    await expect(page.getByRole("dialog", { name: "Compare roles" }).getByRole("columnheader")).toHaveText([
      /Senior Frontend Engineer/,
      /Staff Frontend Engineer/,
    ]);
  });

  test("a dragged job shrinks to a compact chip instead of carrying the whole card", async ({ page }) => {
    // Record what the browser is given as the drag image, with its real layout.
    await page.addInitScript(() => {
      const original = DataTransfer.prototype.setDragImage;
      DataTransfer.prototype.setDragImage = function (element, x, y) {
        const box = element.getBoundingClientRect();
        (window as unknown as { dragPreview: unknown }).dragPreview = {
          width: box.width,
          height: box.height,
          x,
          y,
          text: element.textContent,
        };
        return original.call(this, element, x, y);
      };
    });
    await page.reload();

    const card = sampleJob(page, "Senior Frontend Engineer");
    const cardBox = (await card.boundingBox())!;
    await dragToCompare(page, "Senior Frontend Engineer");
    await expect(traySlots(page)).toHaveCount(1);

    const preview = (await page.evaluate(() => (window as unknown as { dragPreview: unknown }).dragPreview)) as {
      width: number;
      height: number;
      x: number;
      y: number;
      text: string;
    };
    expect(preview.text).toBe("91fitSenior Frontend EngineerNorthwind Labs");
    // About the size of a tray slot, a fraction of the card.
    expect(preview.width).toBe(240);
    expect(preview.height).toBeLessThan(72);
    expect(preview.width * preview.height).toBeLessThan((cardBox.width * cardBox.height) / 5);
    // Held by its fit score, so it trails the pointer.
    expect(preview.x).toBe(22);
    expect(preview.y).toBeCloseTo(preview.height / 2);
    await expect(page.locator("[data-compare-drag-preview]")).toHaveCount(0);
  });

  test("the Compare button on each job works without dragging", async ({ page }) => {
    await page.getByRole("button", { name: "Add Senior Frontend Engineer at Northwind Labs to compare" }).click();
    await page.getByRole("button", { name: "Add Frontend Engineer, GraphQL at Quill Studio to compare" }).click();
    await expect(traySlots(page)).toHaveCount(2);

    await tray(page).getByRole("button", { name: /^Compare/ }).click();
    await expect(page.getByRole("dialog", { name: "Compare roles" }).getByRole("columnheader")).toHaveCount(2);
  });

  test("the tray survives opening a job and coming back", async ({ page }) => {
    await dragToCompare(page, "Senior Frontend Engineer");
    await dragToCompare(page, "Frontend Engineer, GraphQL");

    await sampleJob(page, "Senior Frontend Engineer").getByRole("link").first().click();
    // A cold `pnpm dev` compiles the job page on first visit, which can take a while.
    await expect(page).toHaveURL(/\/demo\/jobs\/northwind-senior-frontend$/, { timeout: 30_000 });
    await page.getByRole("link", { name: "Back to job feed" }).click();

    await expect(traySlots(page)).toHaveCount(2);
    expect(
      await page.evaluate((key) => window.sessionStorage.getItem(key), DEMO_COMPARE_SESSION_KEY)
    ).toBe(JSON.stringify(["northwind-senior-frontend", "quill-graphql-frontend", null, null]));
  });

  test("rank priorities by dragging, and the best role changes with them", async ({ page }) => {
    await dragToCompare(page, "Senior Frontend Engineer");
    await dragToCompare(page, "Staff Frontend Engineer");
    await tray(page).getByRole("button", { name: /^Compare/ }).click();

    const dialog = page.getByRole("dialog", { name: "Compare roles" });
    const verdict = dialog.getByTestId("compare-verdict");
    await expect(verdict).toContainText("Best for your priorities: Senior Frontend Engineer at Northwind Labs");

    // Drag Salary above Fit with the mouse.
    const priorities = dialog.getByRole("list", { name: "Your priorities, most important first" });
    const salary = priorities.locator('li[data-priority="salary"]');
    const from = (await salary.boundingBox())!;
    const to = (await priorities.locator('li[data-priority="fit"]').boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y + 4, { steps: 8 });
    await page.mouse.up();

    await expect(priorities.locator("li")).toHaveText([/#1Salary5 pts/, /#2Fit4 pts/, /#3Location/, /#4Remote/, /#5Freshness1 pt/]);
    await expect(verdict).toContainText("Best for your priorities: Staff Frontend Engineer at Lumen Health");
    await expect(verdict).toContainText("fits you best (91 fit vs 78)");

    // The visitor is told the ranking is saved, and it is there next time.
    await expect(dialog.getByTestId("priorities-save-status")).toHaveText("Saved just now in this browser.");
    await page.reload();
    await tray(page).getByRole("button", { name: /^Compare/ }).click();
    const again = page.getByRole("dialog", { name: "Compare roles" });
    await expect(again.getByTestId("compare-verdict")).toContainText("Staff Frontend Engineer at Lumen Health");
    await expect(again.getByTestId("priorities-save-status")).toHaveText(
      "Saved in this browser, so it's here next time."
    );
    expect(await page.evaluate((key) => window.localStorage.getItem(key), DEMO_PRIORITIES_KEY)).toBe(
      JSON.stringify(["salary", "fit", "location", "remote", "freshness"])
    );
  });

  test("priorities can be set from the tray before comparing", async ({ page }) => {
    await page.getByRole("button", { name: "Add Senior Frontend Engineer at Northwind Labs to compare" }).click();
    await page.getByRole("button", { name: "Add Staff Frontend Engineer at Lumen Health to compare" }).click();
    await tray(page).getByRole("button", { name: "Your priorities" }).click();

    const settings = page.getByRole("dialog", { name: "Your priorities" });
    await settings.getByRole("button", { name: "Move Salary up" }).click();
    await settings.getByRole("button", { name: "Move Salary up" }).click();
    await settings.getByRole("button", { name: "Compare 2 roles" }).click();

    await expect(page.getByRole("dialog", { name: "Compare roles" }).getByTestId("compare-verdict")).toContainText(
      "It leads on salary (your #1)."
    );
  });
});

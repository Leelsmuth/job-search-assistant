import { expect, test } from "@playwright/test";

test("a signed-out visitor can save, track, and reset a sample job", async ({ page, browser }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Try the demo" }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.getByRole("button", { name: "Reset demo" })).toBeDisabled();

  await page.getByRole("button", { name: "Save Frontend Engineer" }).click();
  await page.getByRole("link", { name: "Application tracker" }).click();
  await expect(page.getByRole("heading", { name: "Frontend Engineer" })).toHaveCount(1);

  const status = page.getByRole("combobox", { name: "Status for Frontend Engineer" });
  await expect(status).toHaveValue("saved");
  await status.selectOption("applied");
  await page.reload();
  await expect(status).toHaveValue("applied");

  const otherVisitor = await browser.newPage();
  try {
    await otherVisitor.goto("/demo/applications");
    await expect(otherVisitor.getByText("Save a job from the feed to start tracking it.")).toBeVisible();
  } finally {
    await otherVisitor.close();
  }

  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByRole("status")).toHaveText("Demo reset.");
  await expect(status).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Reset demo" })).toBeDisabled();
  await page.getByRole("link", { name: "Job feed" }).click();
  await expect(page.getByRole("button", { name: "Save Frontend Engineer" })).toBeVisible();
});

test("demo visitors still have to sign in to use the regular app", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Job feed" })).toBeVisible();

  for (const path of ["/jobs", "/applications"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
  }
});

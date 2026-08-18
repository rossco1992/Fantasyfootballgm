import { expect, test } from "@playwright/test";

test("home page renders the application shell", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /application foundation is running/i }),
  ).toBeVisible();
});

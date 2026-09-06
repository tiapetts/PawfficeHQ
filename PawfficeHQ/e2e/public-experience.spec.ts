import { expect, test, type Page } from "@playwright/test";

function watchForPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("sign-in and trial entry points render without browser crashes", async ({ page }) => {
  const errors = watchForPageErrors(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /Run the business/i })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "New to PawfficeHQ? Start free" }).click();
  await expect(page.getByRole("heading", { name: "Create your Pawffice" })).toBeVisible();
  await expect(page.getByLabel("First name")).toBeVisible();
  await expect(page.getByText("No credit card required to create your account.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("password recovery can be opened and safely cancelled", async ({ page }) => {
  const errors = watchForPageErrors(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await expect(page.getByRole("heading", { name: "Sign in to PawfficeHQ" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("support and legal routes remain reachable", async ({ page }) => {
  const errors = watchForPageErrors(page);
  for (const [path, heading] of [
    ["/support.html", "PawfficeHQ Support"],
    ["/contact.html", "Contact PawfficeHQ"],
    ["/privacy.html", "Privacy Policy"],
    ["/terms.html", "Terms of Service"],
  ]) {
    const response = await page.goto(path);
    expect(response?.ok()).toBe(true);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

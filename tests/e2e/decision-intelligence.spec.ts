import { test, expect } from "@playwright/test";

test("synthetic signal becomes an evidence-bound decision awaiting human review", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto("/decision-intelligence");
  await expect(
    page.getByRole("heading", { name: "Decision Intelligence Command Center" }),
  ).toBeVisible();
  const creation = page.waitForResponse(response => response.url().endsWith("/api/v1/decisions/demo") && response.request().method() === "POST");
  await page
    .getByRole("button", { name: "Run synthetic demo", exact: true })
    .click();
  const created = await (await creation).json();
  await expect(page.getByText(created.id.slice(0, 8), { exact: true })).toBeVisible();
  await expect(
    page.getByText("Rule-selected for review", { exact: true }),
  ).toBeVisible({ timeout: 120000 });
  await expect(
    page.getByText("Synthetic manufacturing data", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Inference unavailable", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Scenario simulator", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Knowledge retrieval/ }).click();
  const inspector = page.getByRole("dialog");
  await expect(
    inspector.getByRole("heading", {
      name: "Knowledge retrieval",
      exact: true,
    }),
  ).toBeVisible();
  await expect(inspector).toContainText("decision-quality-demo.md");
  await inspector.getByRole("button", { name: "Close details" }).click();
  await page
    .getByRole("button", { name: "Submit for review", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review decision", exact: true })
    .click();
  await expect(inspector).toContainText("without executing operational changes");
  await expect(
    inspector.getByRole("button", { name: "Record approval" }),
  ).toBeDisabled();
  await expect(inspector.getByLabel("Reviewer token")).toHaveValue("");
  await inspector.getByRole("button", { name: "Close details" }).click();
  await expect(
    page.getByRole("button", { name: "Review decision", exact: true }),
  ).toBeVisible();
  // Real approval belongs to a human; this synthetic case is intentionally left awaiting review.
});

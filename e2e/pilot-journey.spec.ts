import { expect, test } from "@playwright/test";
import path from "node:path";

test("رحلة تجريبية حقيقية من ملف الخطة إلى تقرير محكوم", async ({ page }) => {
  await page.goto("/cases");
  await page.getByRole("link", { name: "إنشاء حالة مراجعة جديدة" }).first().click();

  await page.waitForFunction(() => {
    const input = document.querySelector('[data-testid="plan-file-input"]');
    return input && Object.keys(input).some((key) => key.startsWith("__reactProps$"));
  });
  await page.getByLabel("العمر (سنوات)").fill("9");
  await page.getByTestId("field-ref-code").fill("ST-E2E-001");
  await page
    .getByTestId("plan-file-input")
    .setInputFiles(path.join(import.meta.dirname, "fixtures", "arabic-plan.txt"));
  await expect(page.getByTestId("plan-file-preview")).toContainText("جاهز للحفظ");
  await page.getByTestId("submit-create-case").click();

  await expect(page).toHaveURL(/\/cases\/[^/]+\/sources$/);
  await expect(page.getByTestId("plan-saved-state")).toBeVisible();
  await page.getByTestId("sources-primary-cta").click();

  await expect(page).toHaveURL(/\/ingestion$/);
  await expect(page.getByTestId("ingestion-all-settled")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: "مراجعة بنود الخطة" }).click();

  await page.getByTestId("run-local-extraction").click();
  await expect(page.getByTestId("local-extraction-note")).toBeVisible();
  const pendingEvidence = page.locator("[data-evidence-id]").filter({ hasText: "معلق" });
  const count = await pendingEvidence.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    await pendingEvidence.first().getByRole("button", { name: "تأكيد" }).click();
  }
  await page.getByRole("button", { name: "إكمال تأكيد الاستخراج" }).click();
  await page.getByTestId("primary-action-continue").click();

  await page.getByTestId("confirm-scope-button").click();
  await page.getByTestId("primary-action-continue").click();

  await page.getByRole("button", { name: "تشغيل محرك المراجعة" }).click();
  const goalContext = page.getByTestId("goal-context-trigger").first();
  await expect(goalContext).toContainText("أن يقرأ المتعلم عشرين كلمة بصرية");
  await goalContext.focus();
  await expect(page.getByTestId("goal-context-tooltip").first()).toContainText(
    "النص الأصلي في الخطة",
  );
  await goalContext.click();
  await expect(page.getByTestId("goal-context-expanded").first()).toContainText(
    "أن يقرأ المتعلم عشرين كلمة بصرية بدقة ثمانين بالمئة",
  );
  const goalCard = goalContext.locator("xpath=ancestor::*[@data-testid='finding-card']");
  await goalCard.getByRole("button", { name: "مراجعة وإصدار القرار" }).click();
  await expect(page.getByTestId("goal-context-in-decision")).toContainText(
    "أن يقرأ المتعلم عشرين كلمة بصرية بدقة ثمانين بالمئة",
  );
  await page.getByTestId("finding-panel").getByRole("button", { name: "إغلاق" }).click();
  while ((await page.getByTestId("finding-awaiting-decision").count()) > 0) {
    const pendingCard = page
      .getByTestId("finding-card")
      .filter({ has: page.getByTestId("finding-awaiting-decision") })
      .first();
    await pendingCard.getByRole("button", { name: "مراجعة وإصدار القرار" }).click();
    await page.getByTestId("finding-panel").getByTestId("finding-decision-accept").click();
  }
  await page.getByTestId("review-view-system").click();
  const acknowledgeSystem = page.getByTestId("acknowledge-system-classifications");
  if (await acknowledgeSystem.isVisible()) await acknowledgeSystem.click();
  await expect(page.getByTestId("complete-review-btn")).toBeEnabled();
  await page.getByTestId("complete-review-btn").click();
  await page.getByTestId("create-report-link").click();

  await page.getByTestId("generate-report-btn").click();
  await expect(page.getByTestId("report-executive-summary")).not.toBeEmpty();
  await expect(page.getByTestId("report-item-provenance").first()).toBeVisible();
  await page.getByTestId("finalize-report-btn").click();
  await expect(page.getByTestId("report-version-status")).toContainText("معتمدة");
});

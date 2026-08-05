npm notice
npm notice New minor version of npm available! 11.9.0 -> 11.19.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.19.0
npm notice To update run: npm install -g npm@11.19.0
npm notice
import { expect, test } from "@playwright/test";

function createTextPdf(): Buffer {
  const stream = "BT\n/F1 18 Tf\n72 720 Td\n(HIMAM plan goal baseline support evidence) Tj\nET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

test("PDF حقيقي ينتقل من الرفع إلى اكتمال القراءة دون طريق مسدود", async ({ page }) => {
  await page.goto("/cases/new");
  await page.waitForFunction(() => {
    const input = document.querySelector('[data-testid="plan-file-input"]');
    return input && Object.keys(input).some((key) => key.startsWith("__reactProps$"));
  });
  await page.getByLabel("العمر (سنوات)").fill("9");
  await page.getByTestId("plan-file-input").setInputFiles({
    name: "himam-plan.pdf",
    mimeType: "application/pdf",
    buffer: createTextPdf(),
  });
  await expect(page.getByTestId("plan-file-preview")).toContainText("جاهز للحفظ");
  await page.getByTestId("submit-create-case").click();
  await expect(page).toHaveURL(/\/cases\/[^/]+\/sources$/);
  await page.getByTestId("sources-primary-cta").click();

  await expect(page).toHaveURL(/\/ingestion$/);
  await expect(page.getByTestId("ingestion-all-settled")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("primary-action-continue")).toBeEnabled();
});

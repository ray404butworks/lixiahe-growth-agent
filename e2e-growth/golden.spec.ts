import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function openMobileControl(page: Page, name: string) {
  const control = page.getByRole("button", { name, exact: true });
  if (await control.isVisible()) await control.click();
}

test("合成样例、映射、指标、筛选、清除", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /载入样例：正常经营/ }).click();
  await page.getByRole("button", { name: /确认导入，查看看板/ }).click();
  await expect(page.getByText("225,436.00", { exact: true })).toBeVisible();
  await openMobileControl(page, "筛选");
  await page
    .getByRole("combobox", { name: "销售渠道", exact: true })
    .selectOption("微信私域");
  await expect(page.locator(".kpi").first()).toContainText("69,540.00");
  await page.getByRole("button", { name: "重置筛选" }).click();
  await expect(page.locator(".kpi").first()).toContainText("225,436.00");
  await page.getByRole("button", { name: "清除本次会话" }).click();
  await openMobileControl(page, "工作台菜单");
  await page.getByRole("button", { name: "经营看板" }).click();
  await expect(
    page.getByRole("heading", { name: "还没有销售数据" }),
  ).toBeVisible();
});
test("XLSX样例导入", async ({ page }) => {
  await page.goto("/");
  await page
    .getByLabel("选择销售数据文件")
    .setInputFiles("public/templates/synthetic-normal.xlsx");
  await expect(
    page.getByRole("heading", { name: "确认字段，让数据对得上" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /确认导入，查看看板/ }).click();
  await expect(page.locator(".kpi").first()).toContainText("225,436.00");
});

// 阶段三待真实浏览器复验；当前已由组件测试与HTTP检查覆盖。
test("无Key诊断、事实核对、营销草稿与七日清单", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /载入样例：正常经营/ }).click();
  await page.getByRole("button", { name: /确认导入，查看看板/ }).click();
  await page.getByRole("button", { name: "进入经营诊断", exact: true }).click();
  await page.getByRole("button", { name: "一键经营诊断" }).click();
  await expect(page.getByText("数据观察").first()).toBeVisible();
  await expect(
    page.getByText(/服务端API Key留空，当前使用离线规则/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "生成营销方案", exact: true })
    .first()
    .click();
  await page.getByLabel("选择商品", { exact: true }).selectOption("RICE-5KG");
  await page.getByRole("checkbox", { name: "我已核对商品名称" }).check();
  await page.getByRole("checkbox", { name: "我已核对商品规格" }).check();
  await page.getByRole("button", { name: "生成营销草稿", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "七日行动清单" }),
  ).toBeVisible();
  await expect(page.getByLabel("编辑商品文案")).toHaveValue(/【待核对产地】/);
  await expect(page.getByText(/^DAY/)).toHaveCount(7);
  await page.getByLabel("编辑商品文案").fill("人工复核版草稿");
  await page.getByRole("button", { name: "查看经营报告" }).click();
  await expect(
    page.getByRole("heading", { name: "七日行动清单" }),
  ).toBeVisible();
  await expect(page.getByText(/人工复核版草稿/)).toBeVisible();
  await expect(page.getByText(/合成样例 · 仅用于演示/).first()).toBeVisible();
  for (const [label, extension] of [
    ["下载 Markdown", ".md"],
    ["下载 HTML", ".html"],
    ["下载 CSV 汇总", ".csv"],
  ]) {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: label }).click();
    const saved = await download;
    expect(saved.suggestedFilename()).toContain(`2026-10-30${extension}`);
    const body = await readFile(await saved.path(), "utf8");
    expect(body).toContain(
      extension === ".csv" ? "扣退款销售额" : "人工复核版草稿",
    );
  }
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("navigation")).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "里下河 · 经营复盘报告" }),
  ).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await openMobileControl(page, "工作台菜单");
  await page.getByRole("button", { name: "营销内容", exact: true }).click();
  await page.getByLabel("商品规格", { exact: true }).fill("10kg");
  await expect(page.getByRole("heading", { name: "七日行动清单" })).toHaveCount(
    0,
  );
  await openMobileControl(page, "工作台菜单");
  await page.getByRole("button", { name: "经营看板", exact: true }).click();
  await openMobileControl(page, "筛选");
  await page
    .getByRole("combobox", { name: "销售渠道", exact: true })
    .selectOption("微信私域");
  await openMobileControl(page, "工作台菜单");
  await page.getByRole("button", { name: "经营报告", exact: true }).click();
  await expect(page.getByText(/当前筛选范围尚无诊断/)).toBeVisible();
  await expect(page.getByText(/人工复核版草稿/)).toHaveCount(0);
});

import { test, expect } from "@playwright/test";
test("合成样例、映射、指标、筛选、清除", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /01 正常经营/ }).click();
  await page.getByRole("button", { name: /确认导入，查看看板/ }).click();
  await expect(page.getByText("225,436.00", { exact: true })).toBeVisible();
  await page.getByLabel("销售渠道", { exact: true }).selectOption("微信私域");
  await expect(page.locator(".kpi").first()).toContainText("69,540.00");
  await page.getByRole("button", { name: "重置筛选" }).click();
  await expect(page.locator(".kpi").first()).toContainText("225,436.00");
  await page.getByRole("button", { name: "清除本次会话" }).click();
  await page.getByRole("button", { name: "经营看板" }).click();
  await expect(
    page.getByRole("heading", { name: "看板从一份数据开始" }),
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
  await page.getByRole("button", { name: /01 正常经营/ }).click();
  await page.getByRole("button", { name: /确认导入，查看看板/ }).click();
  await page.getByRole("button", { name: "经营诊断", exact: true }).click();
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
  await page.getByLabel("商品规格", { exact: true }).fill("10kg");
  await expect(page.getByRole("heading", { name: "七日行动清单" })).toHaveCount(
    0,
  );
});

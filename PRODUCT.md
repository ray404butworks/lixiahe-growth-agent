# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

里下河农企增长 Agent 帮助农业经营者导入销售表、核对字段，查看渠道销售和贡献毛益、运行经营诊断、编辑营销草稿、阅读本土知识和导出经营报告。

## Capabilities and Constraints

采用当前 GitHub main 的 Next.js App Router、React 和已有数据包。保留六个工作台入口及顺序、CSV/XLSX 校验、精确金额计算、会话数据、模型请求授权和离线回退。实际路由包括 /、/demo/、/dashboard/、/diagnose/、/content/、/report/、/knowledge/、/legal/。
当前源码无 API Key 配置 UI；/legal/ 是数据处理说明页。服务端配置方式保留。本次不新增业务模块、真实付费调用或部署。

## Brand Commitments

按 Ray 2026-11-18 的明确需求，采用 Apple Developer Console / macOS 设置式的中性浅色界面、系统字体、克制的蓝色强调。保留垛田标志形状，提供石墨灰版本。全局署名准确为「奶蛙实验室」，浅灰、小号，不遮挡或接收鼠标事件。

## Evidence on Hand

src/ 为最终仓库源码，data/demo/ 和 public/templates/ 为合成演示样例。e2e-growth/、应用和共享数据包已有回归测试。机器验收不代替 Ray 的视觉审阅。

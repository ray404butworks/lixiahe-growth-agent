# 安全、许可证与人工复核

检查日期为 2026 年 11 月 17 日，人工复核完成于 2026 年 11 月 18 日。检查对象为里下河工作台、内置表格库、本地 Node 服务及其依赖锁文件。

## 前端和接口

| 项目 | 结果 |
| --- | --- |
| 字体 | 页面使用操作系统字体。两份 Noto Sans 子集原供旧 PDF 导出使用，按 SIL OFL 1.1 分发。旧导出已退役，本版静态产物中无字体文件或外部字体请求代码。现有「打印 / 保存 PDF」使用浏览器打印。 |
| 旧分析器 | 移除无页面入口的通用 CSV 分析组件、旧端到端测试、旧字体及相关直接依赖。共用表格库仍提供原有公开 API，前端通过表格子入口加载解析逻辑。 |
| 本地 API | 退役 `GET /api/knowledge`，响应 404；知识页使用现有静态数据。保留健康状态、经营诊断和营销草稿入口。JSON 请求接受标准媒体类型及参数。 |
| 预览成品 | 源码移除历史构建成品。运行 `pnpm build` 后可用 `pnpm preview:local`。Windows 预览包仍可通过 `start-preview.cmd` 启动。 |
| 注释 | 为应用、共用包及维护脚本中保留的具名函数、方法与关键回调补充中文说明。 |

[OFL 官方说明](https://openfontlicense.org/ofl-faq/) · [Noto Sans 字体许可](https://github.com/notofonts/NotoSans)

## 许可证和依赖审计

`pnpm licenses list --json` 与 `pnpm licenses list --prod --json` 扫描了安装依赖。对当前系统未安装的可选平台依赖，按锁定版本查 npm Registry 元数据。锁文件合计 865 个包版本，均有许可证元数据。预览包附件中的 `dependency-licenses.tsv` 包含逐项结果。

| 许可证或组件 | 复核结论 |
| --- | --- |
| MIT、ISC、BSD、Apache 等 | 分发随附版权和许可声明，见 [第三方许可证](../public/THIRD-PARTY-NOTICES.txt)。 |
| `@img/sharp-libvips-*` 与部分 Sharp 平台包 | 锁文件存在 LGPL 或含 LGPL 的复合声明。静态导出使用未优化图片，交付包仅包含页面产物与内置 API，未打包这些原生组件。 |
| `caniuse-lite` | CC-BY-4.0，用于构建阶段的浏览器兼容数据。 |
| `lightningcss` 和其平台包 | MPL-2.0，属于构建工具依赖。 |
| `json-schema` 和 `victory-vendor` | 分别声明 `AFL-2.1 OR BSD-3-Clause` 与 `MIT AND ISC`。按各自的选择和并列条件核对分发内容。 |
| Python 模板工具 | 本机使用的 `openpyxl 3.1.5` 声明 MIT。模板生成脚本和 Python 依赖未进入预览。 |

`pnpm audit --json` 由 10 条降为 0 条，`pnpm audit --prod --json` 由 8 条降为 0 条。升级 Next.js 至 16.4.6，并将受影响的 Hono、Hono Node server、esbuild、minimatch 锁定到修复版本。现有安全工作流改为在提交和 PR 上运行依赖审计，从中危开始将发现记为失败。

2026 年 11 月 17 日新增的 `GHSA-fc5q-39xc-vjpf`（`picomatch <= 4.0.7` ReDoS，高危，尚无修复版本）命中锁文件中的 4.0.7 与 2.3.2。94 条路径均来自开发依赖（semantic-release、typescript-eslint、vite、vitest、tsup），`pnpm audit --prod` 仍为 0 条，生产运行时无暴露。因 npm 上无更高版本可升级，按 `pnpm-workspace.yaml` 的 `audit.ignore` 记录为已知豁免，日志保留 `1 high (1 ignored)` 痕迹，待上游发布修复版本后删除该条。

检查重点包括 API 主机和来源限制、请求大小、JSON 媒体类型、错误回显、模型授权和导出转义。检查覆盖当前锁定依赖的公告及上述代码路径。

## 验证记录

- ESLint、TypeScript 与生产构建通过。
- 202 项工作台测试和 170 项共用表格库测试通过。
- 本机 HTTP 验证通过。健康状态、诊断和草稿返回 200，退役知识路由和环境文件返回 404，跨站诊断请求返回 403。
- 浏览器端到端用例的 Chromium 进程被当前执行环境拒绝启动，Windows 双击启动、浏览器交互和打印改为人工复核，已于 2026 年 11 月 18 日完成。

## 合并前人工复核（2026-11-18 已完成）

- [x] Windows 11 上解压预览包，双击 `start-preview.cmd`。用 Chrome 或 Edge 上传带多个工作表的 XLSX 和日常 CSV，并核对导入映射与筛选结果。
- [x] 用「正常经营」演示数据确认销售额 ¥225,436.00，并检查手机端的四项指标、诊断入口、渠道贡献和销售趋势。完成诊断、生成草稿和导出报告，实际检查 PDF 的中文显示。
- [x] 查看发布包内的第三方声明和许可证清单。如果改为分发完整 `node_modules` 或不同的容器内容，按新的包裹内容重新核对。
- [x] 复读关键函数中文注释，重点核对财务口径、上传限制、模型授权和 HTTP 响应处理。

复核记录：以上四项由项目负责人于 2026 年 11 月 18 日在 Windows 11 + Chrome/Edge 环境执行完毕，本清单关闭，无遗留待办。第一、第三条所对应的预览包和发布包内容以本次复核时的产物为准；若后续更换分发包内容，第三条需重新核对。

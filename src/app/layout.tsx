import "~/styles/globals.css";
import "~/styles/growth.css";
import "~/styles/agent.css";
import "~/styles/report.css";
import "~/styles/dashboard.css";
import "~/styles/import.css";
import "~/styles/workspace.css";
import { BrandWatermark } from "./_components/brand-watermark";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "里下河 · 农企增长 Agent",
  description:
    "泰州特色农品经营数据工作台。导入表格，核对口径，查看销售、渠道与贡献毛益。",
  icons: {
    icon: {
      url: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/duotian-mark.svg`,
      type: "image/svg+xml",
    },
  },
  robots: { index: false, follow: false },
};
/** 设置中文页面语言，并为所有工作台页面提供统一的文档结构。 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <BrandWatermark />
      </body>
    </html>
  );
}

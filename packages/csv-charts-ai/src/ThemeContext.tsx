import { createContext, useContext } from "react";
import { type ChartTheme, defaultDarkTheme } from "./types";

const ChartThemeContext = createContext<ChartTheme>(defaultDarkTheme);

/** 为图表子树提供调用方选择的主题。 */
export function ChartThemeProvider({
  theme,
  children,
}: {
  theme: ChartTheme;
  children: React.ReactNode;
}) {
  return (
    <ChartThemeContext.Provider value={theme}>
      {children}
    </ChartThemeContext.Provider>
  );
}

/** 读取当前主题，未配置时沿用默认主题。 */
export function useChartTheme(): ChartTheme {
  return useContext(ChartThemeContext);
}

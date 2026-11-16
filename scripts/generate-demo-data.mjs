import { registerHooks } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// Node 24 strips TS natively. Resolve the project's extensionless TS imports.
registerHooks({
  /** 为样例生成脚本的本地导入补全 TypeScript 扩展名。 */
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate)))
        return next(candidate.href, context);
    }
    return next(specifier, context);
  },
});
const { generateDemo, rowsToCSV, SCENARIOS } =
  await import("../src/lib/growth/demo.ts");
for (const directory of ["data/demo", "public/templates"])
  mkdirSync(directory, { recursive: true });
for (const { key } of SCENARIOS) {
  const csv = rowsToCSV(generateDemo(key), true);
  writeFileSync(`data/demo/${key}.csv`, csv);
  writeFileSync(`public/templates/${key}.csv`, csv);
}
writeFileSync("public/templates/blank.csv", rowsToCSV([], true));
console.log("已生成3份固定种子合成CSV，每份960行。所有商家与交易均为虚构。");

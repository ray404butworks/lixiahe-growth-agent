/** Exact decimal arithmetic. Inputs have <=8 decimal places; products retain 16.
 * Values enter as strings. No binary float participates in financial totals.
 */
const SCALE = 100000000n;
export const AMOUNT_SCALE = SCALE * SCALE;
/** 把最多十六位小数的累计金额转成定点整数。 */
export function totalUnits(value: string): bigint {
  if (!/^\d+(\.\d{1,16})?$/.test(value)) throw new Error("汇总金额格式错误");
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * AMOUNT_SCALE + BigInt(fraction.padEnd(16, "0"));
}
/** 把单项金额或数量转为八位精度的定点整数。 */
export function decimalUnits(value: string): bigint {
  if (!/^\d{1,18}(\.\d{1,8})?$/.test(value))
    throw new Error("请输入非负金额，最多18位整数、8位小数");
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(8, "0"));
}
/** 将数量与单价相乘，保留十六位精度用于后续汇总。 */
export function multiply(quantity: string, price: string): bigint {
  return decimalUnits(quantity) * decimalUnits(price);
}
/** 将单项金额提升为与乘积一致的十六位精度。 */
export function amountUnits(value: string): bigint {
  return decimalUnits(value) * SCALE;
}
/** 在输出阶段按要求舍入，并把定点整数恢复为小数文本。 */
export function formatUnits(value: bigint, digits = 16): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const scale = 10n ** BigInt(digits);
  const fraction = (absolute % scale)
    .toString()
    .padStart(digits, "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${absolute / scale}${fraction ? `.${fraction}` : ""}`;
}
/** 对两个定点整数做有符号除法，并按指定精度舍入。 */
export function roundedRatio(
  numerator: bigint,
  denominator: bigint,
  decimals = 8,
): string | null {
  if (denominator === 0n) return null;
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const scaled = (n * 10n ** BigInt(decimals) * 2n + d) / (2n * d);
  return formatUnits(negative ? -scaled : scaled, decimals);
}
/** 把金额格式化为带千分位的两位小数。 */
export function money(value: string | null): string {
  if (value === null) return "数据不足";
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = (
    negative ? value.slice(1) : value
  ).split(".");
  const cents =
    BigInt(whole) * 100n +
    BigInt(fraction.padEnd(3, "0").slice(0, 2)) +
    (Number(fraction.padEnd(3, "0")[2]) >= 5 ? 1n : 0n);
  const sign = negative && cents !== 0n ? "-" : "";
  return `${sign}${(cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/** 在文档流末尾预留署名空间，避免覆盖内容、控件和移动端安全区。 */
export function BrandWatermark() {
  return (
    <footer className="brand-watermark" aria-hidden="true">
      <span>奶蛙实验室</span>
    </footer>
  );
}

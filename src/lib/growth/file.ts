/** 读取 XLSX 的 ZIP 目录，提前限制条目数量和预计解压大小。 Bound XLSX ZIP expansion before handing a workbook to the upstream parser. */
export function validateWorkbookArchive(buffer: ArrayBuffer): void {
  const view = new DataView(buffer);
  let eocd = -1;
  for (
    let i = view.byteLength - 22;
    i >= Math.max(0, view.byteLength - 65557);
    i--
  ) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("不是有效的XLSX文件，请重新导出。");
  const entries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true),
    expanded = 0;
  if (!entries || entries > 2000 || offset === 0xffffffff)
    throw new Error("工作簿结构过大或使用不支持的ZIP64格式。");
  for (let i = 0; i < entries; i++) {
    if (
      offset + 46 > view.byteLength ||
      view.getUint32(offset, true) !== 0x02014b50
    )
      throw new Error("工作簿目录损坏。");
    if (view.getUint16(offset + 8, true) & 1)
      throw new Error("不支持加密工作簿，请先去除密码。");
    expanded += view.getUint32(offset + 24, true);
    if (expanded > 25 * 1024 * 1024)
      throw new Error("工作簿解压后超过25MB，请删除无关工作表和格式。");
    offset +=
      46 +
      view.getUint16(offset + 28, true) +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
}

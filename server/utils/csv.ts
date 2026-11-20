// server/utils/csv.ts
// 极简 CSV 读写，供后台菜品导入导出使用（P2-15）。
// 不引第三方库：需求只有「逗号分隔 + 双引号转义 + 换行」，自己实现约 60 行，
// 比多一个依赖更容易控制行为（也避免依赖的解析差异导致导入结果和 Excel 不一致）。

/**
 * 把二维数组拼成 CSV 文本。
 * 含逗号、双引号或换行的单元格必须用双引号包裹，内部双引号写成两个（RFC 4180）。
 */
export function toCsv(headers: string[], rows: string[][]): string {
  const escapeCell = (cell: string): string => {
    if (/[",\r\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`
    return cell
  }
  return [headers, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n')
}

/**
 * 解析 CSV 文本为二维数组。
 * 支持：引号包裹、字段内换行、字段内逗号、转义双引号、CRLF/LF、Excel 导出的 UTF-8 BOM。
 * 说明：CSV 的换行必须靠状态机判断「当前是否在引号内」，所以不能简单按行 split。
 */
export function parseCsv(text: string): string[][] {
  // Excel 另存为 CSV 时会带 BOM，不剥掉会导致第一列表头匹配失败。
  const source = text.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]

    if (inQuotes) {
      if (char === '"') {
        // 连续两个引号表示一个字面量引号，否则是引号区间的结束。
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\r' || char === '\n') {
      // 兼容 CRLF：遇到 \r 时跳过紧随的 \n。
      if (char === '\r' && source[index + 1] === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  // 最后一行可能没有换行结尾，需要补一次。
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  // 丢掉完全空白的行（Excel 常在末尾留空行）。
  return rows.filter((line) => line.some((value) => value.trim() !== ''))
}

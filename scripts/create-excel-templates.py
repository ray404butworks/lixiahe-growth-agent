"""Development helper. Requires openpyxl. All distributed XLSX files are synthetic."""
import csv
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment

root = Path(__file__).resolve().parents[1]
with (root / 'public/templates/normal.csv').open(encoding='utf-8-sig') as handle:
    values = list(csv.reader(handle))

def style(sheet):
    sheet.freeze_panes = 'A2'
    sheet.auto_filter.ref = sheet.dimensions
    for cell in sheet[1]:
        cell.font = Font(color='FFFFFF', bold=True)
        cell.fill = PatternFill('solid', fgColor='315F46')
        cell.alignment = Alignment(wrap_text=True)
    for col in sheet.columns:
        sheet.column_dimensions[col[0].column_letter].width = 24

for template in [True, False]:
    book = Workbook()
    sheet = book.active
    sheet.title = '销售数据'
    sheet.append(values[0])
    for row in values[1:2] if template else values[1:]:
        sheet.append(row)
    style(sheet)
    note = book.create_sheet('填写说明')
    for item in [
        ['里下河农企增长 Agent — 合成模板，非真实企业数据'],
        ['导入时请选择“销售数据”工作表；模板示例行请替换或删除。'],
        ['成本字段空白代表未知，明确为0时请填写0。费用必须分摊到订单行。'],
        ['日期填写YYYY-MM-DD；退款金额归属订单日；不要上传姓名、电话、收货地址。'],
        ['订单状态仅接受paid/refunded/cancelled，或已支付/已完成/已退款/已取消等已列明状态。'],
        ['产品名称不代表获得地理标志授权或认证。'],
    ]: note.append(item)
    note.column_dimensions['A'].width = 100
    book.save(root / 'public/templates' / ('lixiahe-template.xlsx' if template else 'synthetic-normal.xlsx'))
print('已生成Excel模板和960行合成样例。')

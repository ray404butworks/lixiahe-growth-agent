"""Independent Decimal baseline, using the distributed CSVs rather than JS code."""
import csv,json
from pathlib import Path
from decimal import Decimal, getcontext
getcontext().prec=100
root=Path(__file__).resolve().parents[1]
def ledger(rows):
    rows=[r for r in rows if r['订单状态']!='cancelled']
    gross=sum((Decimal(r['销售数量'])*Decimal(r['销售单价']) for r in rows),Decimal(0))
    refunds=sum((Decimal(r['该行退款金额']) for r in rows),Decimal(0))
    costs=sum((Decimal(r['销售数量'])*Decimal(r['单位进货成本'])+Decimal(r['该行分摊运费'])+Decimal(r['该行分摊平台费'])+Decimal(r['该行分摊广告费']) for r in rows),Decimal(0))
    return {'gross_sales':format(gross,"f"),'net_sales':format(gross-refunds,"f"),'known_refunds':format(refunds,"f"),'known_variable_costs':format(costs,"f"),'contribution':format(gross-refunds-costs,"f"),'quantity':format(sum((Decimal(r['销售数量']) for r in rows),Decimal(0)), 'f'),'line_count':len(rows),'order_count':len({r['订单编号'] for r in rows})}
result={}
for scenario in ['normal','low-contribution','high-refund']:
    with (root/'data/demo'/f'{scenario}.csv').open(encoding='utf-8-sig') as f: rows=list(csv.DictReader(f))
    result[scenario]={'totals':ledger(rows),'channels':{key:ledger([r for r in rows if r['销售渠道']==key]) for key in sorted({r['销售渠道'] for r in rows})}}
def canonical(value):
    if isinstance(value, dict): return {key:canonical(item) for key,item in value.items()}
    if isinstance(value, str): return format(Decimal(value).normalize(),'f')
    return value
result=canonical(result)
(root/'data/demo/independent-ledger.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print('独立Python Decimal基准账本已生成（3种场景及9个渠道汇总）。')

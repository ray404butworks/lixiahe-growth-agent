export type KnowledgeCard = {
  knowledge_id: string;
  title: string;
  jurisdiction: string;
  product_tags: string[];
  summary: string;
  source_org: string;
  source_url: string;
  published_at: string;
  fetched_at: string;
  last_verified_at: string;
  status: "verified" | "pending";
  usage_rights: string;
  claim_constraints: string[];
};
const common = {
  jurisdiction: "江苏泰州·兴化",
  fetched_at: "2026-11-05",
  last_verified_at: "2026-11-05",
  status: "verified" as const,
  usage_rights: "公开资料的必要事实摘要，保留出处；非商家认证或机构背书",
};
const industry = {
  source_org: "兴化市人民政府办公室（泰州市政府转载）",
  source_url:
    "https://www.taizhou.gov.cn/xwzx/sqdt/art/2026/art_a8ef209b3dd84867ae51dd125fc36e95.html",
  published_at: "2026-03-16",
};
export const KNOWLEDGE_CARDS: KnowledgeCard[] = [
  {
    ...common,
    ...industry,
    knowledge_id: "K01",
    title: "兴化稻麦与虾蟹产业",
    product_tags: ["大米", "河蟹", "通用"],
    summary: "当地农业产业建设聚焦稻麦、虾蟹，并覆盖香葱和淡水鱼等特色品类。",
    claim_constraints: ["产业事实不证明单个商品的产地、品质或认证。"],
  },
  {
    ...common,
    ...industry,
    knowledge_id: "K02",
    title: "区域品牌与企业品牌",
    product_tags: ["大米", "河蟹", "通用"],
    summary: "公开资料介绍当地推动区域公用品牌与企业产品品牌协同建设。",
    claim_constraints: ["品牌建设背景不等于商家获得品牌、地理标志或有机授权。"],
  },
  {
    ...common,
    knowledge_id: "K03",
    title: "泰州农品电商与直供渠道",
    product_tags: ["大米", "河蟹", "蔬菜", "通用"],
    summary:
      "泰州拓展电商合作、社区直供和寄递配送等渠道，并开展地方农品短视频宣传。",
    source_org: "泰州市农业农村局",
    source_url:
      "https://nyncj.taizhou.gov.cn/ywdt/bmdt/art/2025/art_e3c418bcdfba4f50a49455ef5cc7ae0e.html",
    published_at: "2025-08-28",
    claim_constraints: [
      "渠道建设不证明当前商家已入驻、已获补贴或获得平台推荐。",
    ],
  },
  {
    ...common,
    ...industry,
    knowledge_id: "K04",
    title: "冷链与统仓配送背景",
    product_tags: ["河蟹", "蔬菜", "通用"],
    summary: "当地官方资料介绍冷链网络、电商冷链产业园和统仓共配服务建设。",
    claim_constraints: [
      "不得据此承诺具体店铺冷链、包邮、送达时效或存活率；须由商家确认。",
    ],
  },
  {
    ...common,
    knowledge_id: "K05",
    title: "兴化大闸蟹地理标志标准",
    product_tags: ["河蟹"],
    summary:
      "DB32/T 2953-2016涉及受保护产品范围及检验、标志、包装、运输等要求。",
    source_org: "全国标准信息公共服务平台",
    source_url:
      "https://std.samr.gov.cn/db/search/stdDBDetailedCNF?id=91D99E4D7B9F2E24E05397BE0A0A3A10",
    published_at: "2016-05-20",
    claim_constraints: [
      "不能将普通河蟹自动命名为受保护产品；本系统不代审产地范围与使用资格。",
    ],
  },
  {
    ...common,
    knowledge_id: "K06",
    title: "河蟹追溯与售后标准化",
    product_tags: ["河蟹"],
    summary: "兴化河蟹标准化体系建设覆盖追溯、物流、售后与品牌等环节。",
    source_org: "泰州市市场监督管理局",
    source_url:
      "https://scjgj.taizhou.gov.cn/xwzx/sjdt/art/2024/art_b621a2ccf47845a7b85350b71317d0fa.html",
    published_at: "2024-09-24",
    claim_constraints: [
      "体系建设规划不是商家已经达标的证明；产品追溯和售后说明仍须核实。",
    ],
  },
];
/** 按商品名匹配已核验的主题卡，并纳入通用卡。 */
export function knowledgeForProduct(name: string): KnowledgeCard[] {
  const tag = /蟹/.test(name)
    ? "河蟹"
    : /米/.test(name)
      ? "大米"
      : /蔬菜|香葱/.test(name)
        ? "蔬菜"
        : "通用";
  return KNOWLEDGE_CARDS.filter(
    (card) =>
      card.status === "verified" &&
      (card.product_tags.includes(tag) || card.product_tags.includes("通用")),
  );
}

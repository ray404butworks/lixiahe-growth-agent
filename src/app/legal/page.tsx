export default function LegalPage() {
  return (
    <main
      style={{
        maxWidth: 800,
        margin: "50px auto",
        padding: 24,
        color: "#314b37",
        background: "#fff",
      }}
    >
      <h1>数据与开源说明</h1>
      <p>
        本版本为阶段三开发演示。原始文件在浏览器解析；诊断时标准化经营字段发送到本地服务重新计算，不存入持久数据库。API
        Key默认为空，不调用外部模型。未来启用模型还需本次明确允许，模型只接收汇总指标和来源摘要，不接收订单ID或原始文件。
      </p>
      <p>
        合成样例中的商家和交易为虚构，不能用作真实经营成果。产品名称不代表取得地理标志授权、产地认证或品牌授权。
      </p>
      <p>
        贡献毛益不等同净利润，扣退款销售额不等同结算到账收入。上传前请移除客户姓名、电话号码和地址。
      </p>
      <p>
        基于CSV AI Analyzer改造，遵循其MIT许可，版权声明保留于项目LICENSE文件。
      </p>
      <a href="/">返回工作台</a>
    </main>
  );
}

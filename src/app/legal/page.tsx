/** 展示数据处理和模型授权方式，并提供返回入口。 */
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
      <h1>数据设置</h1>
      <p>销售文件在浏览器中解析，经营指标由本地服务计算。</p>
      <p>模型调用开关在每次诊断时确认。</p>
      <p>样例商家与交易均为演示数据。</p>
      <a href="/">返回工作台</a>
    </main>
  );
}

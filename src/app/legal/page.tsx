/** 展示数据处理和模型授权方式，并提供返回入口。 */
export default function LegalPage() {
  return (
    <main className="legal-page">
      <h1>数据设置</h1>
      <section>
        <h2>文件与经营数据</h2>
        <p>销售文件在浏览器中解析，经营指标由本地服务计算。</p>
      </section>
      <section>
        <h2>模型授权</h2>
        <p>模型调用开关在每次诊断时确认。</p>
      </section>
      <section>
        <h2>演示数据</h2>
        <p>样例商家与交易均为演示数据。</p>
      </section>
      <a href="/">返回工作台</a>
    </main>
  );
}

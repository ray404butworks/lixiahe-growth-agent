import { spawn } from "node:child_process";
import { registerHooks } from "node:module";
import { existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate)))
        return next(candidate.href, context);
    }
    return next(specifier, context);
  },
});
const { demoRequest, demoContent } =
  await import("../src/lib/agent/fixtures.ts");
const port = 18080;
const child = spawn(process.execPath, ["scripts/serve-preview.mjs"], {
  env: {
    ...process.env,
    LIXIAHE_PORT: String(port),
    LIXIAHE_MODEL_API_KEY: "",
    LIXIAHE_MODEL_ENABLED: "false",
    LIXIAHE_NO_OPEN: "true",
  },
  stdio: ["ignore", "ignore", "ignore"],
});
const base = `http://127.0.0.1:${port}`;
try {
  let health;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`${base}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        health = await response.json();
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(health, "local API did not become ready");
  assert.equal(health.reason, "key_missing");
  const post = (path, body, headers = {}) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  const diagResponse = await post("/api/diagnose", demoRequest());
  assert.equal(diagResponse.status, 200);
  const diagnosis = await diagResponse.json();
  assert.equal(diagnosis.meta.mode, "rules");
  assert.equal(diagnosis.meta.attempts, 0);
  assert(diagnosis.recommendations.length >= 3);
  const contentResponse = await post("/api/content", demoContent());
  assert.equal(contentResponse.status, 200);
  const content = await contentResponse.json();
  assert.equal(content.text.video_segments.length, 3);
  assert.equal(content.plan.length, 7);
  assert(content.text.product_copy.includes("【待核对产地】"));
  const homepage = await fetch(base);
  assert.equal(homepage.status, 200);
  assert((await homepage.text()).includes("阶段 01—03"));
  assert.equal((await fetch(`${base}/.env.local`)).status, 404);
  assert.equal(
    (
      await post("/api/diagnose", demoRequest(), {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  const report = {
    measured_at: new Date().toISOString(),
    runtime: process.version,
    mode: health.mode,
    model_key_configured: false,
    real_model_calls: 0,
    diagnostic_status: diagResponse.status,
    recommendation_count: diagnosis.recommendations.length,
    content_status: contentResponse.status,
    video_segments: content.text.video_segments.length,
    action_days: content.plan.length,
    static_html: "passed",
    env_file_not_public: "passed",
    cross_origin_rejected: "passed",
    scope: "real Node HTTP service + static page bytes; not browser E2E",
  };
  writeFileSync(
    "docs/phase3-http-smoke.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  child.kill("SIGTERM");
}

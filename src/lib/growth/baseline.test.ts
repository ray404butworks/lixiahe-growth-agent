import { describe, expect, it } from "vitest";
import baseline from "../../../data/demo/independent-ledger.json";
import { generateDemo, type Scenario } from "./demo";
import { computeMetrics } from "./metrics";
describe("与独立Python Decimal账本交叉核对", () => {
  for (const scenario of Object.keys(baseline) as Scenario[]) {
    it(`${scenario}总账与各渠道金额完全一致`, () => {
      const metrics = computeMetrics(generateDemo(scenario));
      expect(metrics.totals).toMatchObject(baseline[scenario].totals);
      for (const [channel, expected] of Object.entries(
        baseline[scenario].channels,
      ))
        expect(
          metrics.channels.find((group) => group.key === channel),
        ).toMatchObject(expected);
    });
  }
});

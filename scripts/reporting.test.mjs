import test from "node:test";
import assert from "node:assert/strict";
import { activitySeries, teamIndicators } from "../src/lib/reporting.mjs";

const visits = [
  {
    userId: "claudionor",
    date: "2026-10-01",
    stage: "closing",
    sold: ["FORRO"],
    saleValue: 800,
  },
  {
    userId: "claudionor",
    date: "2026-10-01",
    stage: "prospecting",
    sold: [],
    saleValue: 0,
  },
  {
    userId: "charles",
    date: "2026-10-03",
    stage: "relationship",
    sold: [],
    saleValue: 0,
  },
];
test("presença usa dias únicos, conversão usa visitas com venda e os filtros não inventam atividade", () => {
  const [claudi, charles, celso] = teamIndicators(visits);
  assert.equal(claudi.days, 1);
  assert.equal(claudi.visits, 2);
  assert.equal(claudi.sales, 1);
  assert.equal(claudi.conversion, 50);
  assert.equal(claudi.value, 800);
  assert.equal(claudi.share, 66.7);
  assert.equal(charles.days, 1);
  assert.equal(celso.days, 0);
  assert.equal(celso.conversion, 0);
  assert.equal(
    teamIndicators(visits.filter((v) => v.userId === "charles"))[1].share,
    100,
  );
});
test("série conserva contagens, mostra intervalos vazios e limita períodos longos sem alocar um dia por linha", () => {
  const daily = activitySeries(visits, "2026-10-01", "2026-10-03");
  assert.deepEqual(
    daily.map((b) => b.visits),
    [2, 0, 1],
  );
  assert.equal(
    daily.reduce((n, b) => n + b.sales, 0),
    1,
  );
  const long = activitySeries(visits, "2025-01-01", "2026-12-31");
  assert.ok(long.length <= 12);
  assert.equal(
    long.reduce((n, b) => n + b.visits, 0),
    3,
  );
  assert.deepEqual(activitySeries(visits, "2026-10-03", "2026-10-01"), []);
  assert.deepEqual(activitySeries([], "", ""), []);
});

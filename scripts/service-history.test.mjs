import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { emptyData } from "../src/lib/domain.mjs";
import { applyServiceHistoryCleanup, applyServiceHistoryJob, parseHistoricalEntry, validateHistoryJob } from "../src/lib/service-history.mjs";

test("limpeza remove somente a seleção conferida, preserva demais dados e é idempotente", () => {
  const flagged = record("C10", "Obra - Forro - HR");
  const kept = record("C11");
  const data = { ...emptyData(), serviceHistory: [flagged, kept], services: [{ id: "keep" }], crm: { sales: [{ value: 350 }] } };
  const before = structuredClone(data);
  const plan = { version: 1, id: "services-history-cleanup-test-selection", targetOrigin: "http://127.0.0.1:5174", records: [{ id: flagged.id, fingerprint: flagged.fingerprint }] };
  const result = applyServiceHistoryCleanup(data, plan);
  assert.deepEqual(result.data.serviceHistory, [kept]);
  assert.deepEqual(result.data.services, before.services);
  assert.deepEqual(result.data.crm, before.crm);
  assert.deepEqual(data, before);
  assert.equal(applyServiceHistoryCleanup(result.data, plan).alreadyApplied, true);
  assert.throws(() => applyServiceHistoryCleanup(data, { ...plan, records: [{ id: kept.id, fingerprint: kept.fingerprint }] }), /histórico mudou/);
  assert.throws(() => applyServiceHistoryCleanup(data, { ...plan, records: [{ id: flagged.id, fingerprint: "0".repeat(64) }] }), /histórico mudou/);
});

const record = (cell, raw = "Obra exemplo - Instalador A/Auxiliar B - Forro - Effa 1", extra = {}) => {
  const source = { id: `agenda-servicos-2026/Outubro/${cell}`, sheet: "Outubro", cell, date: "2026-10-01", raw, status: "completed", ...extra };
  return { ...source, ...parseHistoricalEntry(source), fingerprint: createHash("sha256").update(JSON.stringify([source.date, source.raw, source.status])).digest("hex") };
};
const job = (records = [record("C10"), record("D10", undefined, { date: "2026-10-02" })]) => ({ version: 1, id: "services-history-test-authorized-sv1", targetOrigin: "http://127.0.0.1:5174", sourceFile: "Agenda de serviços.xlsx", sourceHash: "a".repeat(64), excludedSheets: ["Julho"], deleteServiceNumber: 1, records });

test("histórico preserva lançamentos diários, separa anotações e não presume profissionais", () => {
  assert.equal(record("C10").crewText, "Instalador A/Auxiliar B");
  assert.equal(record("C10").description, "Forro");
  assert.equal(record("C10").raw.endsWith("Effa 1"), true);
  assert.equal(record("C11", "FERIADO").kind, "note");
  assert.equal(record("C12", "#Equipe em treinamento").kind, "note");
  assert.equal(record("C13", "Obra exemplo - Drywall - HR").crewText, "");
  assert.equal(record("C13", "Obra exemplo - Drywall - HR").needsReview, true);
  const result = applyServiceHistoryJob(emptyData(), job());
  assert.equal(result.data.serviceHistory.length, 2);
  assert.deepEqual(result.data.visits, []);
  assert.equal(result.data.installers, undefined);
});

test("exclusão remove apenas SV-0001, preserva financeiro e reimportação não exclui outra vez", () => {
  const data = { ...emptyData(), services: [{ id: "test", number: 1, saleId: "sale-1" }, { id: "keep", number: 2 }], crm: { sales: [{ id: "sale-1", value: 350 }] }, serviceDecisions: { "sale-1": "required" } };
  const before = structuredClone(data), plan = job();
  const first = applyServiceHistoryJob(data, plan);
  assert.deepEqual(first.data.services.map((row) => row.id), ["keep"]);
  assert.equal(first.receipt.removedTestCount, 1);
  assert.equal(first.data.serviceDecisions["sale-1"], "pending");
  assert.equal(first.data.nextInstallationNumber, 3);
  assert.deepEqual(first.data.crm, before.crm);
  assert.deepEqual(data, before);
  const later = { ...first.data, services: [...first.data.services, { id: "different", number: 1 }] };
  const second = applyServiceHistoryJob(later, plan);
  assert.equal(second.alreadyApplied, true);
  assert.equal(second.data.serviceHistory.length, 2);
  assert.ok(second.data.services.some((row) => row.id === "different"));
});

test("abas excluídas, duplicatas e substituições conflitantes impedem a operação inteira", () => {
  assert.throws(() => validateHistoryJob(job([record("C10", undefined, { sheet: "Julho" })])), /aba excluída/);
  assert.throws(() => validateHistoryJob({ ...job(), targetOrigin: "https://example.com" }), /prévia local/);
  assert.throws(() => validateHistoryJob(job([record("C10"), record("C10")])), /repetidos/);
  const data = { ...emptyData(), services: [{ id: "test", number: 1 }], serviceHistory: [record("C10", "Texto anterior")] };
  const before = structuredClone(data);
  assert.throws(() => applyServiceHistoryJob(data, job()), /mudou/);
  assert.deepEqual(data, before);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { parseHistoricalEntry } from "../src/lib/service-history.mjs";

const records = Array.from({ length: 15 }, (_, index) => {
  const raw = index === 14 ? "#Observação de treinamento" : `Cliente histórico ${index + 1} - Instalador de teste/Auxiliar - Forro - Effa 1`;
  const entry = { id: `agenda-servicos-2026/Outubro/C${index + 10}`, sheet: "Outubro", cell: `C${index + 10}`, date: `2026-10-${String(index + 1).padStart(2, "0")}`, raw, status: index === 0 ? "unknown" : "completed" };
  return { ...entry, ...parseHistoricalEntry(entry), fingerprint: createHash("sha256").update(raw).digest("hex") };
});
const job = { version: 1, id: "services-history-browser-fixture-sv1", sourceFile: "Planilha de teste.xlsx", sourceHash: "1".repeat(64), targetOrigin: "http://127.0.0.1:5174", deleteServiceNumber: 1, excludedSheets: ["Julho"], records };
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "pt-BR" });
const page = await context.newPage(), errors = [], remote = [], receipts = [];
page.on("pageerror", (error) => errors.push(error.message));
page.setDefaultTimeout(10000);
await context.route(/neon\.tech|supabase\./, (route) => { remote.push(route.request().url()); return route.abort(); });
await context.route("**/__famac_local/services-history", (route) => route.fulfill({ status: 204 }));
await context.route("**/__famac_local/services-history-cleanup", (route) => route.fulfill({ status: 204 }));
await context.route("**/__famac_local/services-history-cleanup-receipt", (route) => route.fulfill({ status: 204 }));
await context.route("**/__famac_local/services-history-receipt", (route) => { receipts.push(route.request().postDataJSON()); return route.fulfill({ status: 204 }); });
const nav = async () => {
  if (await page.locator(".menu-toggle").isVisible()) await page.getByRole("button", { name: "Abrir navegação", exact: true }).click();
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Serviços", exact: true }).click();
  await page.getByRole("button", { name: "Histórico importado", exact: true }).click();
};
try {
  await page.goto("http://127.0.0.1:5174/");
  await page.getByLabel("Colaborador na prévia").waitFor();
  await page.evaluate(async () => {
    const { cloudEnabled } = await import("/src/lib/auth.mjs");
    if (cloudEnabled) throw new Error("Fixtures somente na prévia local.");
    const { repository } = await import("/src/lib/repository.mjs");
    const { emptyData, newVisit, recordVisit } = await import("/src/lib/domain.mjs");
    const { saveService, newService } = await import("/src/lib/services.mjs");
    let data = recordVisit(emptyData(), { ...newVisit("claudionor"), workName: "Venda preservada", street: "Rua A", city: "Sorriso", neighborhood: "Centro", state: "MT", stage: "closing", offered: ["FORRO"], sold: ["FORRO"], saleValue: "350" });
    for (const name of ["Teste a excluir", "Serviço a preservar"]) data = saveService(data, { ...newService(), name, address: "Rua A", neighborhood: "Centro", city: "Sorriso", description: "Serviço" }, "Teste");
    await repository.save(data);
    return data.services.map((row) => ({ id: row.id, number: row.number }));
  }).then((value) => assert.deepEqual(value.map((row) => row.number), [1, 2]));
  await context.unroute("**/__famac_local/services-history");
  await context.route("**/__famac_local/services-history", (route) => route.fulfill({ json: job }));
  await page.reload(); await page.getByLabel("Colaborador na prévia").waitFor();
  await nav();
  await page.getByText("15 lançamentos importados", { exact: true }).waitFor();
  await page.getByText("O teste SV-0001 foi excluído desta prévia antes da importação.", { exact: true }).waitFor();
  assert.equal(await page.locator(".service-history-table tbody tr").count(), 12);
  await page.getByRole("navigation", { name: "Paginação de lançamentos históricos" }).getByRole("button", { name: "Próxima página" }).click();
  assert.equal(await page.locator(".service-history-table tbody tr").count(), 3);
  await page.getByLabel("Buscar no histórico").fill("Cliente histórico 1 -");
  assert.equal(await page.locator(".service-history-table tbody tr").count(), 1);
  await page.getByRole("button", { name: "Ver lançamento Outubro C10", exact: true }).click();
  await page.getByRole("dialog").getByText(records[0].raw, { exact: true }).waitFor();
  await page.getByRole("button", { name: "Fechar original" }).click();
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await page.getByLabel("Tipo de lançamento").selectOption("note");
  assert.equal(await page.locator(".service-history-table tbody tr").count(), 1);
  const state = await page.evaluate(async (jobId) => {
    const { repository } = await import("/src/lib/repository.mjs"), { businessSales } = await import("/src/lib/crm.mjs");
    const data = await repository.load();
    const backup = await new Promise((resolve, reject) => {
      const open = indexedDB.open("famac-visitacao-local-v1", 1);
      open.onsuccess = () => { const db = open.result, transaction = db.transaction("application", "readonly"), request = transaction.objectStore("application").get(`service-history-backup:${jobId}`); request.onsuccess = () => resolve(request.result); request.onerror = reject; transaction.oncomplete = () => db.close(); };
    });
    return { numbers: data.services.map((row) => row.number), imported: data.serviceHistory.length, sales: businessSales(data).map((row) => Number(row.value)), crew: data.installers?.length || 0, before: backup.services.length, next: data.nextInstallationNumber };
  }, job.id);
  assert.deepEqual(state, { numbers: [2], imported: 15, sales: [350], crew: 0, before: 2, next: 3 });
  await page.reload(); await page.getByLabel("Colaborador na prévia").waitFor(); await nav();
  assert.equal(receipts.at(-1).removedTestCount, 1);
  assert.equal(receipts.at(-1).importedCount, 15);
  assert.equal(await page.locator(".service-history-table tbody tr").count(), 12);
  await page.mouse.move(1200, 200); await page.waitForTimeout(250);
  await page.screenshot({ path: "test-results/service-history-desktop.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 360, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: "test-results/service-history-mobile.png", fullPage: true, animations: "disabled" });
  const cleanup = { version: 1, id: "services-history-cleanup-browser-fixture", targetOrigin: job.targetOrigin, records: [{ id: records[0].id, fingerprint: records[0].fingerprint }] };
  await context.unroute("**/__famac_local/services-history-cleanup");
  await context.route("**/__famac_local/services-history-cleanup", (route) => route.fulfill({ json: cleanup }));
  await page.reload(); await page.getByLabel("Colaborador na prévia").waitFor(); await nav();
  await page.getByText("14 lançamentos importados", { exact: true }).waitFor();
  assert.equal(await page.getByRole("checkbox", { name: /conferência/ }).count(), 0);
  const cleaned = await page.evaluate(async (id) => {
    const { repository } = await import("/src/lib/repository.mjs");
    const data = await repository.load();
    const backup = await new Promise((resolve, reject) => {
      const open = indexedDB.open("famac-visitacao-local-v1", 1);
      open.onsuccess = () => { const db = open.result, tx = db.transaction("application", "readonly"), req = tx.objectStore("application").get(`service-history-backup:${id}`); req.onsuccess = () => resolve(req.result); req.onerror = reject; tx.oncomplete = () => db.close(); };
    });
    return { before: backup.serviceHistory.length, after: data.serviceHistory.length, removed: data.serviceHistoryCleanups[0].removedCount, services: data.services.length };
  }, cleanup.id);
  assert.deepEqual(cleaned, { before: 15, after: 14, removed: 1, services: 1 });
  await page.reload(); await page.getByLabel("Colaborador na prévia").waitFor(); await nav();
  await page.getByText("14 lançamentos importados", { exact: true }).waitFor();
  assert.deepEqual(errors, []); assert.deepEqual(remote, []);
  console.log("PASS: SV-0001 removido com backup atômico; histórico sem duplicação, filtros, origem, paginação e celular; financeiro e equipe preservados");
} finally { await context.close(); await browser.close(); }

import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { emptyData, newVisit, recordVisit, today } from "../src/lib/domain.mjs";
import { applyCrmAction, reconcileLocalCrm } from "../src/lib/crm.mjs";
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({
  executablePath:
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  locale: "pt-BR",
  timezoneId: "America/Sao_Paulo",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const nav = async (name) => {
  if (await page.locator(".menu-toggle").isVisible())
    await page
      .getByRole("button", { name: "Abrir navegação", exact: true })
      .click();
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("button", { name, exact: true })
    .click();
};
const modal = page.getByRole("dialog");
const open = async (name) =>
  page
    .getByRole("button", { name: `Abrir oportunidade ${name}`, exact: true })
    .click();
const submit = async (name = "Salvar ação") => {
  await modal.getByRole("button", { name, exact: true }).click();
  await modal.waitFor({ state: "hidden" });
};
const fits = async () =>
  assert.equal(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        [...document.querySelectorAll("dialog[open]")].every(
          (item) => item.scrollWidth <= item.clientWidth,
        ),
    ),
    true,
  );
try {
  await page.goto("http://127.0.0.1:5174");
  await page.getByLabel("Colaborador na prévia").waitFor();
  let data = emptyData();
  const names = [
    "Residencial Horizonte",
    "Espaço Aurora",
    "Casa Alameda",
    "Loja Central",
    "Reforma Jardim",
    "Edifício Norte",
  ];
  for (let index = 0; index < names.length; index++)
    data = recordVisit(data, {
      ...newVisit("claudionor"),
      workName: names[index],
      street: "Rua das Palmeiras",
      number: String(10 + index),
      neighborhood: "Centro",
      city: "Sorriso",
      state: "MT",
      offered: index === 3 ? ["TOLDOS"] : ["FORRO", "GESSO"],
      sold: index === 3 ? ["TOLDOS"] : [],
      saleValue: index === 3 ? 2000 : 0,
    });
  data = reconcileLocalCrm(data, null, true);
  const change = (name, input) => {
    const item = data.crm.opportunities.find((item) => item.work.name === name);
    data.crm = applyCrmAction(
      data.crm,
      item.id,
      { version: item.version, ...input },
      { role: "admin", teamId: "claudionor", name: "Claudionor" },
      ["FORRO", "GESSO", "TOLDOS"],
    );
  };
  change(names[1], {
    type: "update",
    stage: "waiting",
    responsibleId: "charles",
    nextAction: "Retomar orçamento",
    nextDate: today(),
  });
  change(names[2], {
    type: "sale",
    products: ["FORRO"],
    value: 700,
    date: today(),
    sellerTeamId: "charles",
  });
  change(names[4], { type: "lose", note: "Obra suspensa pelo cliente" });
  await page.evaluate(async (state) => {
    const db = await new Promise((resolve) => {
      const req = indexedDB.open("famac-visitacao-local-v1", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("application");
      req.onsuccess = () => resolve(req.result);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("application", "readwrite");
      tx.objectStore("application").put(state, "state");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, data);
  await page.reload();
  await page.locator(".visit-form").waitFor();
  await nav("CRM");
  assert.equal(await page.locator(".crm-column").count(), 5);
  assert.equal(await page.locator(".crm-card").count(), 6);
  await fits();
  await page.screenshot({
    path: "test-results/crm-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await open(names[0]);
  await modal.getByLabel("Etapa da oportunidade").selectOption("waiting");
  await modal
    .getByLabel("Responsável atual", { exact: true })
    .selectOption("charles");
  await modal
    .getByLabel("Próxima ação", { exact: true })
    .fill("Enviar orçamento de acabamentos");
  await modal.getByLabel("Data do próximo retorno").fill(today());
  await modal
    .getByLabel("Observação para a equipe")
    .fill("Arquiteto pediu retorno.");
  await submit();
  await page
    .getByLabel("Responsável pela oportunidade")
    .selectOption("charles");
  await page.getByLabel("Buscar oportunidades").fill(names[0]);
  assert.equal(await page.locator(".crm-card").count(), 1);
  await page.getByLabel("Buscar oportunidades").fill("");
  await page.getByLabel("Responsável pela oportunidade").selectOption("");
  await open(names[0]);
  await modal
    .getByRole("button", { name: "Registrar venda", exact: true })
    .click();
  await modal.getByRole("checkbox", { name: "FORRO", exact: true }).check();
  await modal.getByLabel("Valor deste fechamento (R$)").fill("1000");
  await modal.getByLabel("Quem realizou a venda").selectOption("charles");
  await submit("Confirmar venda");
  const horizon = page
    .locator(".crm-card")
    .filter({ has: page.getByRole("button", { name: names[0], exact: true }) });
  await horizon.getByText("Venda parcial", { exact: true }).waitFor();
  await page.getByLabel("Colaborador na prévia").selectOption("celso");
  await open(names[0]);
  await modal
    .getByRole("button", { name: "Registrar venda", exact: true })
    .click();
  assert.equal(
    await modal.getByRole("checkbox", { name: "FORRO", exact: true }).count(),
    0,
  );
  await modal.getByRole("checkbox", { name: "GESSO", exact: true }).check();
  await modal.getByLabel("Valor deste fechamento (R$)").fill("500");
  await submit("Confirmar venda");
  assert.equal(
    await page
      .locator(".crm-won .crm-card")
      .filter({ hasText: names[0] })
      .count(),
    1,
  );
  await open(names[0]);
  await modal
    .getByRole("button", { name: "Reabrir negociação", exact: true })
    .click();
  await modal.getByRole("checkbox", { name: "FORRO", exact: true }).check();
  await modal
    .getByLabel("Motivo", { exact: true })
    .fill("Novo ambiente da mesma obra");
  await submit();
  await open(names[0]);
  await modal
    .getByRole("button", { name: "Registrar visita", exact: true })
    .click();
  await page.locator(".visit-form").waitFor();
  assert.equal(
    await page
      .getByLabel("Nome / identificação da obra", { exact: false })
      .inputValue(),
    names[0],
  );
  await page.getByLabel("Oferecer FORRO", { exact: true }).check();
  await page
    .getByRole("button", { name: "Registrar visita", exact: true })
    .click();
  await page
    .getByText("Visita registrada com sucesso.", { exact: true })
    .waitFor();
  await nav("CRM");
  assert.equal(await page.locator(".crm-card").count(), 6);
  await open(names[0]);
  await modal
    .getByLabel("Observação para a equipe")
    .fill("Minha anotação preservada");
  await page.evaluate(
    async (id) => {
      const { repository } = await import("/src/lib/repository.mjs");
      const current = await repository.load();
      const item = current.crm.opportunities.find((row) => row.id === id);
      await repository.crmAction(id, {
        type: "note",
        version: item.version,
        note: "Atualização de outro acesso",
      });
    },
    data.crm.opportunities.find((item) => item.work.name === names[0]).id,
  );
  await modal.getByRole("button", { name: "Salvar ação", exact: true }).click();
  await modal
    .getByRole("button", { name: "Revisar com dados atuais" })
    .waitFor();
  assert.equal(
    await modal.getByLabel("Observação para a equipe").inputValue(),
    "Minha anotação preservada",
  );
  await modal.getByRole("button", { name: "Revisar com dados atuais" }).click();
  await submit();
  await page.screenshot({
    path: "test-results/crm-workflow.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .locator(".crm-prospecting .crm-card")
    .filter({ hasText: names[0] })
    .dragTo(
      page.getByRole("region", { name: "Aguardando retorno", exact: true }),
    );
  await modal.waitFor();
  assert.equal(
    await modal.getByLabel("Etapa da oportunidade").inputValue(),
    "waiting",
  );
  await submit();
  assert.equal(
    await page
      .locator(".crm-waiting .crm-card")
      .filter({ hasText: names[0] })
      .count(),
    1,
  );
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 850 });
    await fits();
    await page
      .getByRole("group", { name: "Etapas do CRM" })
      .getByRole("button", { name: /Aguardando retorno/ })
      .click();
    await page.screenshot({
      path: `test-results/crm-mobile-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await open(names[0]);
    await fits();
    await page.screenshot({
      path: `test-results/crm-detail-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
  }
  await nav("Relatórios");
  await page
    .locator(".reports-page")
    .getByLabel("Produto", { exact: true })
    .selectOption("GESSO");
  assert.equal(await page.locator(".crm-sales-report tbody tr").count(), 1);
  await page
    .locator(".crm-sales-report")
    .getByText("Celso", { exact: true })
    .waitFor();
  await fits();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar vendas", exact: true })
    .click();
  assert.equal((await download).suggestedFilename(), "famac-fechamentos.csv");
  assert.deepEqual(errors, []);
  console.log(
    "PASS: kanban, filtros, responsáveis, venda parcial por Charles e conclusão por Celso, reabertura, visita sem duplicar obra, conflito preservando rascunho, financeiro e CSV; desktop e celular",
  );
} catch (error) {
  await page
    .screenshot({ path: "test-results/crm-failure.png", fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}

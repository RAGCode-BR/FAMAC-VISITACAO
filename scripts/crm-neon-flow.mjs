import assert from "node:assert/strict";
import { today } from "../src/lib/domain.mjs";

export async function runCrmNeon({
  clau,
  charles,
  celso,
  call,
  navigate,
  base,
}) {
  const name = "Obra CRM compartilhada";
  for (const page of [clau, charles, celso]) {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.reload();
    await page.locator(".visit-form").waitFor();
  }
  const form = clau.locator(".visit-form");
  await form
    .getByLabel("Nome / identificação da obra", { exact: false })
    .fill(name);
  await form
    .getByLabel("Rua / avenida", { exact: false })
    .fill("Rua CRM teste");
  await form.getByLabel("Número", { exact: true }).fill("777");
  await form.getByLabel("Bairro", { exact: false }).fill("Centro CRM");
  await form.getByLabel("Cidade", { exact: false }).fill("Sorriso");
  await form.getByLabel("UF", { exact: false }).fill("MT");
  await form.getByLabel("Oferecer GESSO", { exact: true }).check();
  await form.getByLabel("Oferecer PERSIANA", { exact: true }).check();
  await form
    .getByLabel("O que foi conversado / oferecido?")
    .fill("Anotação privada do prospector");
  await form
    .getByLabel("Selecionar fotos da obra")
    .setInputFiles("public/famac-logo.jpg");
  await form.locator(".photo-grid img").waitFor();
  await form
    .getByRole("button", { name: "Registrar visita", exact: true })
    .click();
  await clau
    .getByText("Visita registrada com sucesso.", { exact: true })
    .waitFor({ timeout: 45000 });
  let state = (await call(clau, "/state")).data;
  const opportunity = state.crm.opportunities.find(
    (item) => item.work.name === name,
  );
  assert.ok(opportunity);
  assert.equal(opportunity.prospectorId, "claudionor");
  const privateVisit = state.visits.find((item) => item.workName === name);
  assert.ok(privateVisit);
  assert.equal(JSON.stringify(opportunity).includes("Anotação privada"), false);
  assert.equal(
    (await call(charles, `/photos/${privateVisit.photos[0].id}/url`)).status,
    403,
  );
  assert.equal(
    (await call(charles, "/state")).data.visits.some(
      (item) => item.id === privateVisit.id,
    ),
    false,
  );
  assert.equal(
    (
      await fetch(`${base}/crm/${opportunity.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    401,
  );
  await charles.reload();
  await charles.locator(".visit-form").waitFor();
  await navigate(charles, "CRM");
  const open = async (page) =>
    page
      .getByRole("button", { name: `Abrir oportunidade ${name}`, exact: true })
      .click();
  const submit = async (page, label = "Salvar ação") => {
    await page
      .getByRole("dialog")
      .getByRole("button", { name: label, exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 45000 });
  };
  await open(charles);
  let dialog = charles.getByRole("dialog");
  await dialog.getByLabel("Etapa da oportunidade").selectOption("negotiating");
  await dialog
    .getByLabel("Vendedor responsável", { exact: true })
    .selectOption("charles");
  await dialog
    .getByLabel("Próxima ação", { exact: true })
    .fill("Retomar com arquiteto");
  await dialog.getByLabel("Data do próximo retorno").fill(today());
  await submit(charles);
  await navigate(charles, "Programação");
  await charles
    .locator(".crm-schedule-returns")
    .getByText(name, { exact: true })
    .waitFor();
  await navigate(charles, "CRM");
  await open(charles);
  await charles
    .getByRole("dialog")
    .getByRole("button", { name: "Registrar venda", exact: true })
    .click();
  dialog = charles.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: "GESSO", exact: true }).check();
  await dialog.getByLabel("Valor deste fechamento (R$)").fill("700");
  const action = async (
    page,
    action,
    actorTeamId = "claudionor",
    operationId = crypto.randomUUID(),
  ) =>
    call(page, `/crm/${opportunity.id}/actions`, {
      method: "POST",
      body: JSON.stringify({ operationId, actorTeamId, action }),
    });
  state = (await call(clau, "/state")).data;
  const current = state.crm.opportunities.find(
    (item) => item.id === opportunity.id,
  );
  const operationId = crypto.randomUUID();
  const update = {
    type: "note",
    version: current.version,
    note: "Contato simultâneo do prospector",
  };
  assert.equal(
    (await action(clau, update, "claudionor", operationId)).status,
    200,
  );
  assert.equal(
    (await action(clau, update, "claudionor", operationId)).status,
    200,
  );
  assert.equal(
    (await action(charles, update, "charles", operationId)).status,
    403,
  );
  await dialog
    .getByRole("button", { name: "Confirmar venda", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Revisar com dados atuais" })
    .waitFor({ timeout: 45000 });
  assert.equal(
    await dialog.getByLabel("Valor deste fechamento (R$)").inputValue(),
    "700",
  );
  assert.ok(
    await dialog
      .getByRole("checkbox", { name: "GESSO", exact: true })
      .isChecked(),
  );
  await dialog
    .getByRole("button", { name: "Revisar com dados atuais" })
    .click();
  await submit(charles, "Confirmar venda");
  state = (await call(charles, "/state")).data;
  let shared = state.crm.opportunities.find(
    (item) => item.id === opportunity.id,
  );
  assert.equal(shared.stage, "negotiating");
  assert.deepEqual(shared.pendingProducts, ["PERSIANA"]);
  assert.equal(
    state.crm.activities.filter((item) => item.note === update.note).length,
    1,
  );
  assert.equal(
    (
      await action(clau, {
        type: "sale",
        version: shared.version,
        products: ["PERSIANA"],
        value: 300,
        date: today(),
        sellerTeamId: "celso",
      })
    ).status,
    403,
  );
  await celso.reload();
  await celso.locator(".visit-form").waitFor();
  await navigate(celso, "CRM");
  await open(celso);
  await celso
    .getByRole("dialog")
    .getByRole("button", { name: "Registrar venda", exact: true })
    .click();
  dialog = celso.getByRole("dialog");
  assert.equal(
    await dialog.getByRole("checkbox", { name: "GESSO", exact: true }).count(),
    0,
  );
  await dialog.getByRole("checkbox", { name: "PERSIANA", exact: true }).check();
  await dialog.getByLabel("Valor deste fechamento (R$)").fill("300");
  await submit(celso, "Confirmar venda");
  state = (await call(celso, "/state")).data;
  shared = state.crm.opportunities.find((item) => item.id === opportunity.id);
  assert.equal(shared.stage, "won");
  const sales = state.crm.sales.filter(
    (item) => item.opportunityId === shared.id,
  );
  assert.equal(sales.length, 2);
  assert.equal(
    sales.reduce((sum, item) => sum + item.value, 0),
    1000,
  );
  assert.ok(sales.every((item) => item.prospectorId === "claudionor"));
  await charles.reload();
  await charles.locator(".visit-form").waitFor();
  await navigate(charles, "CRM");
  await open(charles);
  await charles
    .getByRole("dialog")
    .getByRole("button", { name: "Registrar visita", exact: true })
    .click();
  const visitForm = charles.locator(".visit-form");
  assert.equal(
    await visitForm
      .getByLabel("Nome / identificação da obra", { exact: false })
      .inputValue(),
    name,
  );
  assert.equal(
    await visitForm
      .getByLabel("Vincular a uma obra existente", { exact: true })
      .inputValue(),
    "",
  );
  const charlesSale = sales.find((item) => item.sellerTeamId === "charles");
  await visitForm
    .getByLabel("Vincular venda já registrada")
    .selectOption(charlesSale.id);
  await visitForm
    .getByLabel("O que foi conversado / oferecido?")
    .fill("Nota privada do Charles");
  await visitForm
    .getByRole("button", { name: "Registrar visita", exact: true })
    .click();
  await charles
    .getByText("Visita registrada com sucesso.", { exact: true })
    .waitFor({ timeout: 45000 });
  state = (await call(charles, "/state")).data;
  assert.equal(
    state.crm.opportunities.filter((item) => item.work.name === name).length,
    1,
  );
  assert.equal(
    state.crm.sales.filter((item) => item.opportunityId === shared.id).length,
    2,
  );
  assert.ok(
    state.crm.sales.find((item) => item.id === charlesSale.id).sourceVisitId,
  );
  assert.ok(
    state.works
      .filter((item) => item.crmOpportunityId === shared.id)
      .every((item) => item.ownerId === "charles"),
  );
  assert.equal(
    (await call(clau, "/state")).data.visits.find(
      (item) => item.id === privateVisit.id,
    ).notes,
    "Anotação privada do prospector",
  );
  const forged = structuredClone(state);
  forged.crm.sales.find((item) => item.id === charlesSale.id).value = 1;
  assert.equal(
    (
      await call(charles, "/state", {
        method: "PUT",
        body: JSON.stringify({
          state: forged,
          revision: state.revision,
          operationId: crypto.randomUUID(),
          actorTeamId: "charles",
        }),
      })
    ).status,
    403,
  );
  await navigate(charles, "Relatórios");
  await charles
    .locator(".reports-page")
    .getByLabel("Bairro", { exact: true })
    .selectOption("Centro CRM");
  await charles
    .locator(".reports-page")
    .getByLabel("Produto", { exact: true })
    .selectOption("GESSO");
  assert.equal(await charles.locator(".crm-sales-report tbody tr").count(), 1);
  await charles
    .locator(".crm-sales-report")
    .getByText("Claudionor", { exact: true })
    .waitFor();
  console.log(
    "PASS: CRM real compartilhado por três colaboradores, privado preservado, retornos na programação, conflito sem perder venda, autoria e idempotência; venda parcial, conclusão, visita vinculada e financeiro sem duplicidade",
  );
}

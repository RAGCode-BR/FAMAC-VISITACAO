import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { today } from "../src/lib/domain.mjs";
import { formatServiceDate, shiftServiceDate } from "../src/lib/services.mjs";

await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
const page = await context.newPage(), errors = [], remote = [];
page.setDefaultTimeout(10000);
page.on("pageerror", (error) => errors.push(error.message));
await page.route(/neon\.tech|supabase\./, (route) => { remote.push(route.request().url()); return route.abort(); });
const cepRequests = [];
await page.route("https://viacep.com.br/**", (route) => { cepRequests.push(route.request().url()); return route.fulfill({ json: { cep: "78550-000", logradouro: "Rua do CEP", bairro: "Centro pelo CEP", localidade: "Sorriso", uf: "MT" } }); });
const button = (name) => page.getByRole("button", { name, exact: true });
const dialog = () => page.getByRole("dialog");
const nav = async (name) => {
  if (await page.locator(".menu-toggle").isVisible()) await button("Abrir navegação").click();
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name, exact: true }).click();
};
const fillService = async (name) => {
  await dialog().getByLabel("Cliente / obra").fill(name);
  await dialog().getByLabel("Serviço a executar").fill("Instalar o forro da sala");
  await dialog().getByLabel("Rua / avenida").fill("Rua A");
  await dialog().getByLabel("Número", { exact: true }).fill("10");
  await dialog().getByLabel("Bairro").fill("Centro");
  await dialog().getByLabel("Cidade").fill("Sorriso");
};
const schedule = async (date = today(), period = "morning") => {
  await dialog().getByRole("button", { name: "Adicionar agendamento" }).click();
  const slot = dialog().locator(".service-appointment-form").last();
  await slot.getByRole("textbox", { name: /^Data inicial/ }).fill(formatServiceDate(date));
  await slot.getByRole("textbox", { name: /^Data final/ }).fill(formatServiceDate(date));
  await slot.getByLabel("Período do serviço").selectOption(period);
  await slot.getByLabel("Ana", { exact: true }).check();
};
const saveForm = async () => {
  await dialog().getByRole("button", { name: "Salvar serviço", exact: true }).click();
  await page.locator(".service-form").waitFor({ state: "hidden" });
};
const act = async (name, note) => {
  await dialog().getByRole("button", { name, exact: true }).click();
  if (note) await dialog().locator("textarea").fill(note);
  await dialog().getByRole("button", { name, exact: true }).click();
  await dialog().locator(".service-detail-heading").waitFor();
};
const fits = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll("dialog[open]")].every((node) => node.scrollWidth <= node.clientWidth)), true, "a página e os modais não devem transbordar");
try {
  await page.goto(process.env.TEST_APP_URL || "http://127.0.0.1:5174/");
  await page.getByLabel("Colaborador na prévia").waitFor();
  await nav("Serviços");
  await page.getByText("Registros salvos somente neste navegador.", { exact: false }).waitFor();
  await button("Equipe de execução").click();
  for (const name of ["Ana", "Bruno"]) {
    await page.getByLabel("Nome do profissional").fill(name);
    await button("Cadastrar profissional").click();
    await page.locator(".services-team-list article", { hasText: name }).waitFor();
  }
  await button("Serviço avulso").click();
  await fillService("Obra Alfa");
  await dialog().getByLabel("CEP", { exact: true }).fill("78550000");
  await dialog().getByLabel("CEP", { exact: true }).press("Tab");
  await dialog().getByText("Endereço encontrado. Confira o número e o bairro antes de salvar.").waitFor();
  assert.equal(await dialog().getByLabel("Rua / avenida").inputValue(), "Rua do CEP");
  assert.equal(await dialog().getByLabel("Bairro").inputValue(), "Centro pelo CEP");
  assert.equal(await dialog().getByLabel("Cidade").inputValue(), "Sorriso");
  assert.equal(await dialog().getByLabel("UF").inputValue(), "MT");
  assert.equal(await dialog().getByLabel("Número", { exact: true }).inputValue(), "10");
  assert.equal(cepRequests.length, 1);
  assert.equal(await dialog().getByLabel(/veículo/i).count(), 0);
  await saveForm();
  await dialog().getByText("Aguardando agendamento", { exact: true }).waitFor();
  await dialog().getByRole("button", { name: "Editar / agendar" }).click();
  await schedule(); await saveForm();
  await act("Iniciar execução");
  await act("Registrar retorno", "Falta finalizar o acabamento");
  await dialog().getByText("Com retorno", { exact: true }).waitFor();
  await dialog().getByRole("button", { name: "Editar / agendar" }).click();
  await schedule(shiftServiceDate(today(), 1));
  await dialog().getByLabel("Fotos do serviço", { exact: true }).setInputFiles("public/famac-logo.jpg");
  await dialog().locator(".service-photo-grid img").waitFor();
  await saveForm();
  await act("Concluir serviço", "Instalação conferida e finalizada");
  await dialog().getByText("Concluído", { exact: true }).waitFor();
  await dialog().getByText(/Falta finalizar o acabamento/).waitFor();
  await button("Fechar janela").click();

  // Somente IndexedDB do contexto descartável; proíbe fixtures em modo cloud.
  await page.evaluate(async () => {
    const { cloudEnabled } = await import("/src/lib/auth.mjs");
    if (cloudEnabled) throw new Error("O teste de serviços exige modo local.");
    const { repository } = await import("/src/lib/repository.mjs");
    const { newVisit, recordVisit } = await import("/src/lib/domain.mjs");
    await repository.save(recordVisit(await repository.load(), { ...newVisit("claudionor"), workName: "Venda Beta", street: "Rua B", number: "20", neighborhood: "Centro", city: "Sorriso", state: "MT", offered: ["FORRO"], sold: ["FORRO"], saleValue: "900", stage: "closing" }));
  });
  await page.reload(); await nav("Serviços");
  await button("Vendas para instalação").click();
  await page.getByLabel("Vendas exibidas").selectOption("all");
  await page.getByRole("row", { name: /Venda Beta/ }).getByRole("button", { name: "Gerar serviço", exact: true }).click();
  assert.equal(await dialog().getByLabel("Cliente / obra").inputValue(), "Venda Beta");
  await schedule(); await saveForm();
  await button("Fechar janela").click();
  await button("Serviço avulso").click(); await fillService("Obra Gama"); await schedule();
  await dialog().getByRole("button", { name: "Salvar serviço" }).click();
  await dialog().getByRole("alert").getByText(/já possui agendamento/).waitFor();
  await dialog().getByLabel("Período do serviço").selectOption("afternoon");
  await saveForm(); await button("Fechar janela").click();
  const result = await page.evaluate(async () => {
    const { repository } = await import("/src/lib/repository.mjs"), { businessSales } = await import("/src/lib/crm.mjs");
    const data = await repository.load();
    return { services: data.services.length, numbers: data.services.map((row) => row.number), photos: data.services[0].photos.length, cep: data.services[0].cep, street: data.services[0].street, state: data.services[0].state, sales: businessSales(data).length, total: businessSales(data).reduce((sum, sale) => sum + Number(sale.value), 0) };
  });
  assert.deepEqual(result, { services: 3, numbers: [1, 2, 3], photos: 1, cep: "78550-000", street: "Rua do CEP", state: "MT", sales: 1, total: 900 });
  await nav("CRM");
  await page.getByRole("button", { name: /^Encerradas/ }).click();
  await button("Abrir oportunidade Venda Beta").click();
  await dialog().getByRole("button", { name: "Criar serviço", exact: true }).click();
  await dialog().getByLabel("Cliente / obra").waitFor();
  assert.equal(await dialog().getByLabel("Cliente / obra").inputValue(), "Venda Beta");
  await dialog().getByRole("button", { name: "Cancelar", exact: true }).click();
  await button("Agenda").click(); await fits();
  await page.mouse.move(1200, 200); await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  assert.ok(await page.locator(".sidebar").evaluate((node) => node.getBoundingClientRect().width) < 100, "a barra lateral deve recuar na agenda");
  await page.screenshot({ path: "test-results/services-desktop.png", fullPage: true, animations: "disabled" });
  await button("Equipe de execução").click();
  assert.equal(await page.getByRole("button", { name: /^(Ativar|Desativar)$/ }).count(), 0);
  page.once("dialog", (confirmation) => confirmation.accept());
  await page.locator(".services-team-list article", { hasText: "Ana" }).getByRole("button", { name: "Excluir" }).click();
  await page.getByRole("alert").getByText(/Reatribua/).waitFor();
  await page.getByLabel("Nome do profissional").fill("Bruno");
  await button("Cadastrar profissional").click();
  const removable = page.locator(".services-team-list article", { hasText: "Bruno" });
  await removable.waitFor();
  page.once("dialog", (confirmation) => confirmation.dismiss());
  await removable.getByRole("button", { name: "Excluir" }).click();
  assert.equal(await removable.count(), 1);
  page.once("dialog", (confirmation) => confirmation.accept());
  await removable.getByRole("button", { name: "Excluir" }).click();
  await removable.waitFor({ state: "hidden" });
  await page.reload(); await nav("Serviços"); await button("Equipe de execução").click();
  assert.equal(await page.locator(".services-team-list article", { hasText: "Bruno" }).count(), 0);
  await page.setViewportSize({ width: 360, height: 800 });
  await button("Agenda").click(); await button("Dia").click(); await fits();
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/services-mobile.png", fullPage: true, animations: "disabled" });
  await button("Todos os serviços").click();
  await page.getByRole("row", { name: /Obra Gama/ }).getByRole("button", { name: "Ver serviço" }).click();
  await dialog().getByRole("button", { name: "Editar / agendar" }).click(); await fits();
  await page.screenshot({ path: "test-results/services-form-mobile.png", fullPage: true });
  await dialog().getByRole("button", { name: "Abrir calendário: Data inicial", exact: true }).click();
  const datePicker = page.getByRole("group", { name: "Calendário: Data inicial", exact: true });
  await datePicker.getByRole("button", { name: `Escolher ${formatServiceDate(today())}`, exact: true }).click();
  assert.equal(await dialog().getByRole("textbox", { name: /^Data inicial/ }).inputValue(), formatServiceDate(today()));
  await fits();
  const usContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
  try {
    const usPage = await usContext.newPage();
    await usPage.goto(process.env.TEST_APP_URL || "http://127.0.0.1:5174/");
    await usPage.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name: "Serviços", exact: true }).click();
    await usPage.getByLabel("Data da agenda", { exact: true }).waitFor();
    assert.equal(await usPage.getByLabel("Data da agenda", { exact: true }).inputValue(), formatServiceDate(today()));
    await usPage.getByRole("button", { name: "Abrir calendário: Data da agenda", exact: true }).click();
    const usPicker = usPage.getByRole("group", { name: "Calendário: Data da agenda", exact: true });
    await usPicker.locator("header strong").getByText(new Date(`${today()}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })).waitFor();
    await usPage.screenshot({ path: "test-results/services-date-picker.png", animations: "disabled" });
    const chosen = `${today().slice(0, 7)}-15`;
    await usPicker.getByRole("button", { name: `Escolher ${formatServiceDate(chosen)}`, exact: true }).click();
    assert.equal(await usPage.getByLabel("Data da agenda", { exact: true }).inputValue(), formatServiceDate(chosen));
  } finally { await usContext.close(); }
  assert.deepEqual(errors, []); assert.deepEqual(remote, []);
  console.log("PASS: CEP automático e endereço persistente; calendário dia/mês/ano inclusive em navegador en-US; serviços, financeiro e celular sem Neon");
} catch (error) {
  await page.screenshot({ path: "test-results/services-failure.png", fullPage: true });
  if (errors.length) console.log(errors);
  throw error;
} finally { await context.close(); await browser.close(); }

import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import {
  emptyData,
  newVisit,
  recordVisit,
  TEAM,
  today,
} from "../src/lib/domain.mjs";

const url = process.env.TEST_APP_URL || "http://127.0.0.1:5174";
await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_PATH ||
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
const navigate = async (name) => {
  if (await page.locator(".menu-toggle").isVisible())
    await page
      .getByRole("button", { name: "Abrir navegação", exact: true })
      .click();
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("button", { name, exact: true })
    .click();
};
const fits = async () =>
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "Tela não pode transbordar",
  );
try {
  await page.goto(url);
  await page.getByLabel("Colaborador na prévia").waitFor();
  let data = emptyData();
  data.contacts = Array.from({ length: 35 }, (_, index) => ({
    id: crypto.randomUUID(),
    name: `Contato de teste ${String(index + 1).padStart(2, "0")}`,
    role: index % 3 ? "architect" : "contractor",
    city: "Cidade teste",
    phone: "",
    company: "",
    notes: "",
  }));
  data.works = Array.from({ length: 25 }, (_, index) => ({
    id: crypto.randomUUID(),
    name: `Obra de teste ${String(index + 1).padStart(2, "0")}`,
    street: "Rua de teste",
    number: "10",
    neighborhood: ["Centro", "Jardim das Flores", "Bela Vista"][index % 3],
    city: "Cidade teste",
    state: "MT",
    type: index % 2 ? "Residencial" : "Comercial",
    responsible: "Responsável teste",
    phone: "",
    contractorId: "",
    architectId: "",
    cep: "",
    complement: "",
  }));
  for (let index = 0; index < 18; index++) {
    const work = data.works[index];
    const date = new Date(`${today()}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (index % 8));
    const sold = index % 4 === 0;
    data = recordVisit(data, {
      ...newVisit(TEAM[index % 3].id),
      ...work,
      workId: work.id,
      workName: work.name,
      date: date.toISOString().slice(0, 10),
      offered: ["FORRO", "GESSO"],
      sold: sold ? ["FORRO"] : [],
      saleValue: sold ? 750 + index * 40 : 0,
      stage: sold ? "closing" : "prospecting",
    });
  }
  await page.evaluate(async (state) => {
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open("famac-visitacao-local-v1", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("application");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
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
  await navigate("Contatos");
  assert.equal(await page.locator(".contact-card").count(), 12);
  const contactsPager = page.getByRole("navigation", {
    name: "Paginação de contatos",
  });
  await contactsPager
    .getByRole("button", { name: "Próxima página", exact: true })
    .click();
  assert.equal(await page.locator(".contact-card").count(), 12);
  await contactsPager
    .getByRole("button", { name: "Próxima página", exact: true })
    .click();
  assert.equal(await page.locator(".contact-card").count(), 11);
  await page.getByRole("button", { name: "Arquitetos", exact: true }).click();
  assert.equal(await page.locator(".contact-card").count(), 12);
  await page.getByLabel("Buscar contatos").fill("Contato de teste 35");
  assert.equal(await page.locator(".contact-card").count(), 1);
  assert.equal(await contactsPager.count(), 0);
  console.log(
    "PASS: Contatos com 35 registros, três páginas e busca/filtro voltando à primeira página",
  );
  await navigate("Obras");
  const worksPager = page.getByRole("navigation", {
    name: "Paginação de obras",
  });
  assert.equal(await page.locator(".work-card").count(), 12);
  await worksPager
    .getByRole("button", { name: "Próxima página", exact: true })
    .click();
  await worksPager
    .getByRole("button", { name: "Próxima página", exact: true })
    .click();
  assert.equal(await page.locator(".work-card").count(), 1);
  await page.getByLabel("Filtrar tipo de obra").selectOption("Comercial");
  assert.equal(await page.locator(".work-card").count(), 12);
  await page.getByLabel("Buscar obras").fill("Obra de teste 25");
  assert.equal(await page.locator(".work-card").count(), 1);
  assert.equal(await worksPager.count(), 0);
  console.log(
    "PASS: Obras com 25 registros, paginação, pesquisa e filtro por tipo",
  );
  await navigate("Produtos");
  await page.getByRole("button", { name: "Novo produto", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Nome do produto", { exact: false }).fill(" gesso ");
  await modal
    .getByRole("button", { name: "Cadastrar produto", exact: true })
    .click();
  await modal.getByText("Já existe um produto com esse nome.").waitFor();
  await modal
    .getByLabel("Nome do produto", { exact: false })
    .fill("Revestimento teste");
  await modal
    .getByRole("button", { name: "Cadastrar produto", exact: true })
    .click();
  await modal.waitFor({ state: "hidden" });
  await page.reload();
  await page.locator(".visit-form").waitFor();
  await navigate("Produtos");
  await page
    .getByRole("heading", { name: "REVESTIMENTO TESTE", exact: true })
    .waitFor();
  await navigate("Nova visita");
  await page
    .getByLabel("Vincular a uma obra existente", { exact: true })
    .selectOption({ index: 1 });
  await page.getByLabel("Oferecer REVESTIMENTO TESTE", { exact: true }).check();
  await page.getByLabel("Vendeu REVESTIMENTO TESTE", { exact: true }).check();
  await page
    .getByLabel("Valor total vendido (R$)", { exact: true })
    .fill("500");
  await page
    .getByRole("button", { name: "Registrar visita", exact: true })
    .click();
  await page
    .getByText("Visita registrada com sucesso.", { exact: true })
    .waitFor();
  await navigate("Relatórios");
  await page
    .locator(".reports-page")
    .getByLabel("Produto", { exact: true })
    .selectOption("REVESTIMENTO TESTE");
  assert.equal(
    await page.locator(".metric").first().locator("strong").textContent(),
    "1",
  );
  assert.equal(
    await page.locator(".metric").nth(2).locator("strong").textContent(),
    "1",
  );
  assert.equal(
    await page.locator(".conversion-panel .kpi-ring strong").textContent(),
    "100%",
  );
  assert.equal(await page.locator(".team-kpi").count(), 3);
  console.log(
    "PASS: produto novo persiste, bloqueia duplicidade e participa de visita, venda, filtros e KPI",
  );
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  assert.equal(
    await page.locator(".metric").first().locator("strong").textContent(),
    "19",
  );
  await page
    .getByRole("img", {
      name: "Evolução das visitas realizadas e das visitas com venda por intervalo de datas",
    })
    .waitFor();
  await page
    .locator(".team-kpi")
    .filter({ hasText: "Charles" })
    .getByRole("button", { name: "Charles", exact: true })
    .click();
  assert.equal(await page.locator(".team-kpi").count(), 1);
  assert.equal(
    await page.locator(".metric").first().locator("strong").textContent(),
    "6",
  );
  await page
    .getByRole("button", { name: "Limpar filtros", exact: true })
    .click();
  const closeNotice = page.getByRole("button", {
    name: "Fechar aviso",
    exact: true,
  });
  if (await closeNotice.isVisible()) await closeNotice.click();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    await fits();
    await page.screenshot({
      path: `test-results/reports-kpi-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    if (width === 390) {
      await page.locator(".team-report").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: "test-results/reports-kpi-mobile-team.png",
        animations: "disabled",
      });
    }
  }
  const pdf = await page.pdf({
    path: "test-results/reports-kpi.pdf",
    format: "A4",
    printBackground: true,
  });
  assert.ok(pdf.length > 10000);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: gráficos/KPI respeitam filtros, computador/tablet/celular sem transbordamento e PDF gerado",
  );
} catch (error) {
  await page.screenshot({
    path: "test-results/features-failure.png",
    fullPage: true,
    animations: "disabled",
  });
  throw error;
} finally {
  await context.close();
  await browser.close();
}

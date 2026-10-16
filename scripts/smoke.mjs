import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { today } from "../src/lib/domain.mjs";

const url = process.env.TEST_APP_URL || "http://127.0.0.1:5174";
await mkdir("test-results", { recursive: true });
await mkdir("docs", { recursive: true });
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
const requests = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("request", (request) => requests.push(request.url()));
await page.route("https://viacep.com.br/**", (route) =>
  route.fulfill({
    json: {
      cep: "01001-000",
      logradouro: "Praça da Sé",
      bairro: "Sé",
      localidade: "São Paulo",
      uf: "SP",
    },
  }),
);
const navigate = async (label) => {
  if (await page.locator(".menu-toggle").isVisible())
    await page
      .getByRole("button", { name: "Abrir navegação", exact: true })
      .click();
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("button", { name: label, exact: true })
    .click();
};
const assertFits = async () =>
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "A página não deve transbordar horizontalmente",
  );

try {
  const response = await page.goto(url);
  assert.equal(response.status(), 200);
  await page
    .getByRole("heading", { name: "Cada visita, uma oportunidade." })
    .waitFor();
  await page.locator(".visit-form").waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    await page.getByLabel("Colaborador na prévia").inputValue(),
    "claudionor",
  );
  assert.equal(await page.locator(".product-option").count(), 14);
  await assertFits();
  await page.screenshot({
    path: "docs/preview-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  console.log(
    "PASS: entrada direta em Nova visita; 14 produtos; tela desktop sem transbordamento",
  );

  // As capturas públicas mostram apenas o estado vazio. Os dados abaixo vivem num contexto descartável.
  await page.setViewportSize({ width: 390, height: 844 });
  await assertFits();
  await page.screenshot({
    path: "docs/preview-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await navigate("Obras");
  await page
    .getByRole("heading", { name: "Um mapa de novas possibilidades" })
    .waitFor();
  await page.getByRole("button", { name: "Nova obra", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await navigate("Relatórios");
  await assertFits();
  await page
    .getByRole("heading", { name: "Interesse e vendas por produto" })
    .waitFor();
  await page.screenshot({
    path: "docs/preview-reports-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({
    path: "docs/preview-reports.png",
    fullPage: true,
    animations: "disabled",
  });
  await navigate("Nova visita");

  await page
    .getByLabel("Nome / identificação da obra", { exact: false })
    .fill("Obra teste de integração");
  await page.getByLabel("CEP", { exact: true }).fill("01001000");
  await page.getByLabel("CEP", { exact: true }).press("Tab");
  await page.getByText("Endereço encontrado.", { exact: false }).waitFor();
  assert.equal(
    await page.getByLabel("Bairro", { exact: false }).first().inputValue(),
    "Sé",
  );
  await page.getByLabel("Número", { exact: true }).fill("100");
  await page
    .getByLabel("Responsável pela obra", { exact: false })
    .fill("Responsável teste");
  await page
    .getByLabel("Telefone de contato", { exact: false })
    .fill("11999991234");
  const addContact = async (role, name) => {
    await page.getByRole("combobox", { name: role, exact: true }).fill(name);
    await page
      .getByRole("button", {
        name: `Cadastrar ${role.toLowerCase()}`,
        exact: true,
      })
      .click();
    const modal = page.getByRole("dialog");
    await modal
      .getByRole("button", { name: "Salvar contato", exact: true })
      .click();
    await modal.waitFor({ state: "hidden" });
    assert.equal(
      await page
        .getByRole("combobox", { name: role, exact: true })
        .inputValue(),
      name,
    );
  };
  await addContact("Empreiteiro", "Empreiteiro teste");
  await addContact("Arquiteto", "Arquiteta teste");
  await page.getByLabel("Oferecer FORRO", { exact: true }).check();
  await page.getByLabel("Oferecer GESSO", { exact: true }).check();
  await page.getByLabel("Vendeu FORRO", { exact: true }).check();
  await page
    .getByLabel("Valor total vendido (R$)", { exact: true })
    .fill("1500");
  await page
    .locator("input[type=file][multiple]")
    .setInputFiles("public/famac-logo.jpg");
  await page.locator(".photo-grid img").waitFor();
  await page.getByText("Programar uma próxima visita", { exact: true }).click();
  await page.getByLabel("Data do retorno", { exact: false }).fill(today());
  await page
    .getByLabel("Próxima ação", { exact: true })
    .fill("Enviar orçamento de gesso");
  // O rascunho é preservado ao consultar outra tela.
  await navigate("Produtos");
  await navigate("Nova visita");
  assert.equal(
    await page
      .getByLabel("Nome / identificação da obra", { exact: false })
      .inputValue(),
    "Obra teste de integração",
  );
  await page
    .getByRole("button", { name: "Registrar visita", exact: true })
    .click();
  await page
    .getByText("Visita registrada com sucesso.", { exact: true })
    .waitFor();
  console.log(
    "PASS: CEP, contatos criados na visita, produtos oferecidos/vendidos, foto, rascunho e retorno",
  );

  await navigate("Relatórios");
  assert.equal(
    await page.locator(".metric").nth(0).locator("strong").innerText(),
    "1",
  );
  assert.equal(
    await page.locator(".metric").nth(2).locator("strong").innerText(),
    "1",
  );
  assert.match(
    await page.locator(".metric").nth(3).locator("strong").innerText(),
    /1\.500,00/,
  );
  await page
    .locator(".reports-page")
    .getByLabel("Arquiteto", { exact: true })
    .selectOption({ label: "Arquiteta teste" });
  await page
    .locator(".reports-page")
    .getByLabel("Empreiteiro", { exact: true })
    .selectOption({ label: "Empreiteiro teste" });
  await page
    .locator(".reports-page")
    .getByLabel("Colaborador", { exact: true })
    .selectOption("claudionor");
  await page
    .locator(".reports-page")
    .getByLabel("Produto", { exact: true })
    .selectOption("GESSO");
  await page
    .locator(".reports-page")
    .getByLabel("Resultado do produto", { exact: true })
    .selectOption("interest");
  assert.equal(
    await page.locator(".metric").first().locator("strong").innerText(),
    "1",
  );
  await page
    .locator(".reports-page")
    .getByLabel("Resultado do produto", { exact: true })
    .selectOption("sold");
  assert.equal(
    await page.locator(".metric").first().locator("strong").innerText(),
    "0",
  );
  await page
    .locator(".reports-page")
    .getByLabel("Produto", { exact: true })
    .selectOption("FORRO");
  assert.equal(
    await page.locator(".metric").first().locator("strong").innerText(),
    "1",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  assert.match((await download).suggestedFilename(), /^famac-visitas/);
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: "test-results/report.pdf",
    format: "A4",
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page
    .getByRole("button", {
      name: "Detalhes de Obra teste de integração",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog")
    .getByText("Enviar orçamento de gesso", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("dialog").locator(".detail-photos img").count(),
    1,
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fechar detalhes" })
    .click();
  console.log(
    "PASS: filtros combinados, interesse e venda distintos, CSV, relatório PDF e foto no histórico",
  );

  await page.reload();
  await page.locator(".visit-form").waitFor();
  await navigate("Obras");
  assert.equal(await page.locator(".work-card").count(), 1);
  await navigate("Programação");
  await page
    .getByRole("button", { name: "Registrar visita", exact: true })
    .click();
  assert.equal(
    await page
      .getByLabel("Nome / identificação da obra", { exact: false })
      .inputValue(),
    "Obra teste de integração",
  );
  await page.getByLabel("Oferecer PORTA", { exact: true }).check();
  await page
    .getByRole("button", { name: "Registrar visita", exact: true })
    .click();
  await page
    .getByText("Visita registrada com sucesso.", { exact: true })
    .waitFor();
  await navigate("Programação");
  await page.getByText("Realizada", { exact: true }).waitFor();
  await navigate("Obras");
  assert.equal(await page.locator(".work-card").count(), 1);
  console.log(
    "PASS: persistência após recarga, obra existente reaproveitada e programação concluída",
  );

  await navigate("Nova visita");
  await page
    .getByLabel("Vincular a uma obra existente", { exact: true })
    .selectOption({ index: 1 });
  await page
    .getByLabel("Tipo de visita", { exact: true })
    .selectOption("relationship");
  await page
    .getByText("Em visitas de relacionamento, os produtos são opcionais.")
    .waitFor();
  await page
    .getByLabel("O que foi conversado / oferecido?", { exact: true })
    .fill("Acompanhar andamento da obra");
  await page
    .getByRole("button", { name: "Registrar visita", exact: true })
    .click();
  await page
    .getByText("Visita registrada com sucesso.", { exact: true })
    .waitFor();
  await navigate("Relatórios");
  await page
    .locator(".reports-page")
    .getByLabel("Tipo de visita", { exact: true })
    .selectOption("relationship");
  assert.equal(
    await page.locator(".metric").first().locator("strong").innerText(),
    "1",
  );
  await page
    .getByRole("button", { name: "Detalhes de Obra teste de integração" })
    .click();
  await page
    .getByRole("dialog")
    .getByText("Nenhum produto registrado.")
    .waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Fechar detalhes" })
    .click();
  console.log("PASS: relacionamento sem produtos salvo e exibido nos relatórios");

  // Todas as telas em celular pequeno e navegação por teclado.
  await page.setViewportSize({ width: 360, height: 800 });
  for (const label of [
    "Visão geral",
    "Nova visita",
    "Visitas realizadas",
    "Programação",
    "Obras",
    "Contatos",
    "Relatórios",
    "Produtos",
    "Colaboradores",
  ]) {
    await navigate(label);
    console.log(`CHECK mobile: ${label}`);
    await assertFits();
    const smallTargets = await page
      .locator("main button")
      .evaluateAll(
        (items) =>
          items.filter(
            (item) =>
              item.getBoundingClientRect().width > 0 &&
              item.getBoundingClientRect().right > innerWidth + 1,
          ).length,
      );
    // Tabelas podem rolar dentro de seu próprio contêiner.
    if (!["Relatórios", "Visitas realizadas", "Visão geral"].includes(label))
      assert.equal(smallTargets, 0, label);
  }
  await page
    .getByRole("button", { name: "Abrir navegação", exact: true })
    .click();
  await page.keyboard.press("Escape");
  assert.equal(
    await page
      .getByRole("button", { name: "Abrir navegação", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  assert.equal(
    requests.some((request) =>
      /supabase|agroverde|sistema-visitacao/i.test(request),
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: 9 telas em celular de 360px, menu acessível, nenhuma chamada ao banco antigo, nenhum erro React",
  );
} catch (error) {
  await page.screenshot({
    path: "test-results/failure.png",
    fullPage: true,
    animations: "disabled",
  });
  console.log(
    await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter(
          (item) =>
            item.getBoundingClientRect().right > innerWidth + 2 &&
            !item.closest(".table-scroll"),
        )
        .slice(0, 20)
        .map((item) => ({
          tag: item.tagName,
          className: item.className,
          width: item.getBoundingClientRect().width,
          right: item.getBoundingClientRect().right,
        })),
    ),
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
}

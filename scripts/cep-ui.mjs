import assert from "node:assert/strict";
import { chromium } from "playwright";

const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_PATH ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  hasTouch: true,
});
const errors = [];
let count = 0;
let failedOnce = false;
let releaseOld;
const oldResponse = new Promise((resolve) => {
  releaseOld = resolve;
});
const installRoutes = async (page) => {
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://viacep.com.br/ws/**", async (route) => {
    count++;
    const cep = route.request().url().split("/")[4];
    if (cep === "22222222") await oldResponse;
    if (cep === "00000000") return route.fulfill({ json: { erro: true } });
    if (cep === "99999998" && !failedOnce) {
      failedOnce = true;
      return route.abort();
    }
    return route.fulfill({
      json: {
        cep,
        logradouro: `Rua ${cep}`,
        bairro: `Bairro ${cep}`,
        localidade: "Cidade de teste",
        uf: "SP",
      },
    });
  });
};
const url = process.env.TEST_APP_URL || "http://127.0.0.1:5174";
const success = (scope) =>
  scope.getByText("Endereço encontrado.", { exact: false }).waitFor();
try {
  const page = await context.newPage();
  await installRoutes(page);
  await page.goto(url);
  const form = page.locator(".visit-form");
  await form.waitFor();
  const cep = form.getByLabel("CEP", { exact: true });
  const number = form.getByLabel("Número", { exact: true });
  const street = form.getByLabel("Rua / avenida", { exact: false });
  const lookup = form.getByRole("button", {
    name: "Buscar endereço",
    exact: true,
  });

  await cep.fill("12345");
  await number.click();
  assert.equal(
    count,
    0,
    "CEP incompleto não deve disparar consulta automática",
  );
  await cep.fill("01001-000");
  await cep.press("Tab");
  await success(form);
  assert.equal(count, 1);
  assert.equal(await street.inputValue(), "Rua 01001000");
  assert.equal(
    await form.getByLabel("Bairro", { exact: false }).inputValue(),
    "Bairro 01001000",
  );
  console.log(
    "PASS: Tab consulta CEP completo e preenche endereço e bairro; CEP incompleto não consulta",
  );

  await street.fill("Endereço ajustado manualmente");
  await cep.focus();
  await cep.press("Tab");
  assert.equal(count, 1);
  assert.equal(await street.inputValue(), "Endereço ajustado manualmente");
  const manual = page.waitForRequest("https://viacep.com.br/ws/01001000/json/");
  await lookup.click();
  await manual;
  await success(form);
  assert.equal(count, 2);
  assert.equal(await street.inputValue(), "Rua 01001000");
  console.log(
    "PASS: sair novamente do mesmo CEP preserva edição manual; botão permite nova consulta",
  );

  await cep.fill("00000000");
  await number.click();
  await form.getByText("CEP não encontrado.", { exact: false }).waitFor();
  await street.fill("Preenchimento manual permitido");
  await cep.fill("99999998");
  await number.click();
  await form
    .getByText("A consulta está indisponível.", { exact: false })
    .waitFor();
  await lookup.click();
  await success(form);
  assert.equal(await street.inputValue(), "Rua 99999998");
  console.log(
    "PASS: CEP inexistente e erro de rede permitem preenchimento manual e nova tentativa",
  );

  const started = page.waitForRequest(
    "https://viacep.com.br/ws/22222222/json/",
  );
  await cep.fill("22222222");
  await number.click();
  await started;
  await number.fill("42");
  await cep.fill("33333333");
  await number.click();
  await success(form);
  assert.equal(await street.inputValue(), "Rua 33333333");
  const stale = page.waitForResponse("https://viacep.com.br/ws/22222222/json/");
  releaseOld();
  await stale;
  // Executar uma ação de leitura após a resposta permite que o callback do fetch termine.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(resolve)),
  );
  assert.equal(await street.inputValue(), "Rua 33333333");
  assert.equal(await number.inputValue(), "42");
  console.log(
    "PASS: resposta antiga não sobrescreve outro CEP nem apaga número digitado durante a consulta",
  );

  const mobile = await context.newPage();
  await installRoutes(mobile);
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(url);
  const visit = mobile.locator(".visit-form");
  await visit.getByLabel("CEP", { exact: true }).fill("44444444");
  await visit.getByLabel("Número", { exact: true }).tap();
  await success(visit);
  assert.equal(
    await visit.getByLabel("Rua / avenida", { exact: false }).inputValue(),
    "Rua 44444444",
  );
  await mobile
    .getByRole("button", { name: "Abrir navegação", exact: true })
    .click();
  await mobile
    .locator(".sidebar nav")
    .getByRole("button", { name: "Obras", exact: true })
    .click();
  await mobile.getByRole("button", { name: "Nova obra", exact: true }).click();
  const modal = mobile.getByRole("dialog");
  await modal.getByLabel("CEP", { exact: true }).fill("55555555");
  await modal.getByLabel("Número", { exact: true }).tap();
  await success(modal);
  assert.equal(
    await modal.getByLabel("Bairro", { exact: false }).inputValue(),
    "Bairro 55555555",
  );
  await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: toque em outro campo consulta automaticamente na visita e no cadastro de obra no celular",
  );
} finally {
  releaseOld();
  await context.close();
  await browser.close();
}

import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.BROWSER_PATH ||
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
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
const dialog = page.getByRole("dialog");
const fileInput = () => dialog.getByLabel("Selecionar fotos do produto");
const save = async (name = "Salvar produto") => {
  await dialog.getByRole("button", { name, exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
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
  await page.goto(process.env.TEST_APP_URL || "http://127.0.0.1:5174");
  await page.getByLabel("Colaborador na prévia").waitFor();
  const images = await page.evaluate(() =>
    ["#b71e36", "#1a315b"].map((color, index) => {
      const canvas = document.createElement("canvas");
      canvas.width = 2400;
      canvas.height = 1500;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 120px sans-serif";
      ctx.fillText(`ACABAMENTO ${index + 1}`, 120, 750);
      return canvas.toDataURL("image/png").split(",")[1];
    }),
  );
  const uploads = images.map((data, index) => ({
    name: `produto-${index + 1}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  }));
  await navigate("Produtos");
  await page.getByRole("button", { name: "Novo produto", exact: true }).click();
  await dialog.getByLabel("Nome do produto").fill("Painel foto teste");
  await fileInput().setInputFiles(uploads);
  await dialog.locator(".product-photo-previews article").nth(1).waitFor();
  assert.equal(
    await dialog
      .locator(".product-photo-previews img")
      .first()
      .evaluate(async (image) => {
        await image.decode();
        return image.naturalWidth;
      }),
    1600,
  );
  await save("Cadastrar produto");
  await page
    .getByRole("button", {
      name: "Ver fotos de PAINEL FOTO TESTE",
      exact: true,
    })
    .click();
  await dialog.getByText("Foto 1 de 2", { exact: true }).waitFor();
  await dialog
    .getByRole("button", { name: "Próxima foto", exact: true })
    .click();
  await dialog.getByText("Foto 2 de 2", { exact: true }).waitFor();
  await page.keyboard.press("ArrowLeft");
  await dialog.getByText("Foto 1 de 2", { exact: true }).waitFor();
  await dialog
    .getByRole("button", {
      name: "Mostrar foto 2 de PAINEL FOTO TESTE",
      exact: true,
    })
    .click();
  await dialog.getByText("Foto 2 de 2", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.locator(".visit-form").waitFor();
  const workField = page.getByLabel("Nome / identificação da obra", {
    exact: false,
  });
  await workField.fill("Rascunho preservado");
  await page.getByLabel("Oferecer PAINEL FOTO TESTE", { exact: true }).check();
  await page
    .getByRole("button", {
      name: "Ver fotos de PAINEL FOTO TESTE",
      exact: true,
    })
    .click();
  await dialog
    .locator(".product-gallery-stage img")
    .evaluate((image) => image.decode());
  for (const width of [1440, 390, 360]) {
    await page.setViewportSize({ width, height: width > 600 ? 1000 : 740 });
    await fits();
    await page.screenshot({
      path: `test-results/product-gallery-${width}.png`,
      animations: "disabled",
    });
  }
  await page.keyboard.press("Escape");
  assert.equal(await workField.inputValue(), "Rascunho preservado");
  assert.ok(
    await page
      .getByLabel("Oferecer PAINEL FOTO TESTE", { exact: true })
      .isChecked(),
  );
  assert.equal(
    await page.getByLabel("Oferecer GESSO", { exact: true }).isChecked(),
    false,
  );
  console.log(
    "PASS: produto novo com fotos comprimidas, capa, galeria e teclado; apresentação durante a visita preserva o rascunho; desktop e celular de 360px",
  );

  await navigate("Produtos");
  await page.getByRole("button", { name: "Editar GESSO", exact: true }).click();
  await fileInput().setInputFiles({
    name: "arquivo.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("não é uma imagem"),
  });
  await dialog
    .getByRole("alert")
    .getByText(/Selecione uma imagem/)
    .waitFor();
  await fileInput().setInputFiles(Array.from({ length: 7 }, () => uploads[0]));
  await dialog
    .getByRole("alert")
    .getByText("Adicione no máximo 6 fotos por produto.")
    .waitFor();
  await fileInput().setInputFiles(uploads);
  await dialog.locator(".product-photo-previews article").nth(1).waitFor();
  await dialog
    .getByRole("button", { name: "Usar como capa", exact: true })
    .click();
  const cover = await dialog
    .locator(".product-photo-previews img")
    .first()
    .getAttribute("src");
  await dialog.getByLabel("Nome do produto").fill("GESSO FOTOS");
  await save();
  await page
    .getByRole("img", { name: "Capa de GESSO FOTOS", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("img", { name: "Capa de GESSO FOTOS", exact: true })
      .getAttribute("src"),
    cover,
  );
  await page
    .getByRole("button", { name: "Editar GESSO FOTOS", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Remover foto 1", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page
    .getByRole("button", { name: "Ver fotos de GESSO FOTOS", exact: true })
    .click();
  await dialog.getByText("Foto 1 de 2", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Editar GESSO FOTOS", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Remover foto 1", exact: true })
    .click();
  await save();
  await page
    .getByRole("button", { name: "Ver fotos de GESSO FOTOS", exact: true })
    .click();
  await dialog.getByText("Foto 1 de 1", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Editar GESSO FOTOS", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Remover foto 1", exact: true })
    .click();
  await save();
  assert.equal(
    await page
      .getByRole("button", { name: "Ver fotos de GESSO FOTOS", exact: true })
      .count(),
    0,
  );
  await page.reload();
  await page.locator(".visit-form").waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Ver fotos de GESSO FOTOS", exact: true })
      .count(),
    0,
  );
  await navigate("Produtos");
  await page
    .getByRole("heading", { name: "GESSO FOTOS", exact: true })
    .waitFor();
  await fits();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: produto inicial aceita fotos e renomeação, troca de capa, limite, tipo de arquivo, cancelamento e remoção com persistência",
  );
} catch (error) {
  await page
    .screenshot({
      path: "test-results/product-photos-failure.png",
      fullPage: true,
    })
    .catch(() => {});
  throw error;
} finally {
  await context.close();
  await browser.close();
}

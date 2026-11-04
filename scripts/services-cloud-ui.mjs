import assert from "node:assert/strict";
import { chromium } from "playwright";

if (!process.env.NEON_BRANCH?.startsWith("famac-e2e-")) throw new Error("Exige branch de teste.");
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
try {
  for (const role of ["admin", "tulio", "collaborator"]) {
    const context = await browser.newContext({ storageState: `test-results/services-${role}-session.local.json`, viewport: { width: 1440, height: 1050 }, locale: "pt-BR" });
    try {
      const page = await context.newPage(), errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("http://127.0.0.1:5175/");
      await page.locator(".visit-form").waitFor({ timeout: 30000 });
      const nav = page.getByRole("navigation", { name: "Navegação principal" });
      const services = nav.getByRole("button", { name: "Serviços", exact: true });
      assert.equal(await services.count(), role === "collaborator" ? 0 : 1);
      if (role !== "collaborator") {
        await services.click();
        await page.getByRole("button", { name: "Novo serviço", exact: true }).waitFor();
        assert.equal(await page.getByText("Prévia local", { exact: true }).count(), 0);
        await page.getByRole("button", { name: "Todos os serviços", exact: true }).click();
        await page.getByText("Obra de integração de serviços", { exact: true }).first().waitFor();
        if (role === "tulio") assert.equal(await nav.getByRole("button", { name: "Colaboradores", exact: true }).count(), 0);
        await page.locator("tr").filter({ hasText: "Obra de integração de serviços" }).getByRole("button", { name: "Ver serviço", exact: true }).click();
        await page.getByRole("dialog").getByText("Concluído", { exact: true }).waitFor();
        await page.getByRole("dialog").locator("img").waitFor();
        await page.waitForFunction(() => document.querySelector("dialog img")?.naturalWidth > 0);
        await page.getByRole("dialog").getByRole("button", { name: /Fechar/ }).first().click();
        if (role === "admin") {
          await page.getByRole("button", { name: "Serviço avulso", exact: true }).click();
          const form = page.locator(".service-form");
          await form.getByLabel("Cliente / obra").fill("Serviço pela interface conectada");
          await form.getByLabel("Serviço a executar").fill("Instalar forro");
          await form.getByLabel("Rua / avenida").fill("Rua de teste");
          await form.getByLabel("Bairro").fill("Centro");
          await form.getByLabel("Cidade").fill("Sorriso");
          await form.getByLabel("Fotos do serviço").setInputFiles("public/famac-logo.jpg");
          await form.locator(".service-photo-grid img").waitFor();
          await form.getByRole("button", { name: "Salvar serviço", exact: true }).click();
          await form.waitFor({ state: "hidden" });
          await page.getByRole("dialog").getByRole("heading", { name: /Serviço pela interface conectada/ }).waitFor();
          await page.waitForFunction(() => document.querySelector("dialog img")?.naturalWidth > 0);
          await page.getByRole("dialog").getByRole("button", { name: /Fechar/ }).first().click();
        }
        await page.setViewportSize({ width: 360, height: 800 });
        await page.screenshot({ path: `test-results/services-cloud-${role}.png`, fullPage: true });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  console.log("PASS: interface conectada — Serviços disponível para ADM e Túlio, oculto para colaborador; persistência, fotos e tela móvel.");
} finally { await browser.close(); }

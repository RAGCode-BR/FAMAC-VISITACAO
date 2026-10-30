import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

await mkdir("test-results", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "pt-BR" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const nav = async (name) => {
  if (await page.locator(".menu-toggle").isVisible()) await page.getByRole("button", { name: "Abrir navegação", exact: true }).click();
  await page.getByRole("navigation", { name: "Navegação principal" }).getByRole("button", { name, exact: true }).click();
};
async function checkCards() {
  const boxes = await page.locator(".crm-card:visible").evaluateAll((cards) => cards.map((card) => {
    const rect = card.getBoundingClientRect();
    const buttons = [...card.querySelectorAll("footer button")].map((button) => {
      const b = button.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, contentFits: button.scrollWidth <= button.clientWidth + 1 };
    });
    return { width: rect.width, height: rect.height, left: rect.left, right: rect.right, bottom: rect.bottom, buttons };
  }));
  assert.ok(boxes.length >= 3);
  assert.equal(new Set(boxes.map((box) => Math.round(box.height))).size, 1, "todos os cartões devem ter a mesma altura");
  assert.equal(new Set(boxes.map((box) => Math.round(box.width))).size, 1, "todos os cartões devem ter a mesma largura");
  for (const card of boxes) for (let i = 0; i < card.buttons.length; i++) {
    const button = card.buttons[i];
    assert.ok(button.contentFits, "texto e ícone devem caber no botão");
    assert.ok(button.left >= card.left && button.right <= card.right && button.bottom <= card.bottom, "ações devem caber dentro do cartão");
    if (i) assert.ok(button.left - card.buttons[i - 1].right >= 7, "ações devem ter espaço entre si");
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}
try {
  await page.goto(process.env.TEST_APP_URL || "http://127.0.0.1:5174/");
  await page.getByLabel("Colaborador na prévia").waitFor();
  await page.evaluate(async () => {
    const { cloudEnabled } = await import("/src/lib/auth.mjs");
    if (cloudEnabled) throw new Error("Fixtures permitidas somente na prévia local.");
    const { emptyData, newVisit, recordVisit, PRODUCTS, today } = await import("/src/lib/domain.mjs");
    const { reconcileLocalCrm } = await import("/src/lib/crm.mjs");
    const { repository } = await import("/src/lib/repository.mjs");
    let data = emptyData();
    for (let i = 0; i < 6; i++) data = recordVisit(data, {
      ...newVisit("claudionor"), workName: i % 2 ? "Residência com um nome muito comprido para testar a apresentação completa da oportunidade" : `Obra ${i}`,
      street: "Rua de teste", number: String(100 + i), neighborhood: i % 2 ? "Bairro com nome bastante comprido" : "Centro", city: "Sorriso", state: "MT",
      offered: i % 2 ? PRODUCTS.slice(0, 10) : ["FORRO"],
      nextAction: i % 2 ? "Entrar em contato com o responsável para apresentar todos os produtos e combinar os próximos passos da negociação" : "",
      scheduleNext: i === 1, nextDate: i === 1 ? today() : "", source: i % 2 ? "lead" : "visit",
    });
    data = reconcileLocalCrm(data);
    data.crm.stageOrder.splice(2, 0, "custom-layout-a", "custom-layout-b");
    data.crm.stageLabels["custom-layout-a"] = "Medição";
    data.crm.stageLabels["custom-layout-b"] = "Orçamento";
    data.crm.opportunities.forEach((item, index) => {
      item.stage = index < 3 ? "prospecting" : "waiting";
      if (index === 1) { item.completedProducts = ["FORRO"]; item.sources = ["lead", "visit"]; }
      item.work.architectName = index % 2 ? "Arquiteto com nome comprido para conferência visual" : "";
    });
    await repository.save(data);
  });
  await page.reload();
  await nav("CRM");
  await page.locator('label[for="crm-search"]').waitFor();
  await checkCards();
  await page.screenshot({ path: "test-results/crm-layout-desktop.png" });

  // Mede o texto e o conteúdo principal a cada quadro da animação real.
  await page.mouse.move(500, 50);
  await page.waitForTimeout(250);
  await page.evaluate(() => {
    window.sidebarAnimation = new Promise((resolve) => {
      const frames = [], start = performance.now();
      const sample = () => {
        const range = document.createRange();
        range.selectNodeContents(document.querySelector(".brand-tagline"));
        const stable = [document.querySelector(".sidebar-logo-frame"), document.querySelector(".brand-system"), document.querySelector(".workspace")]
          .map((node) => { const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); });
        frames.push({ width: document.querySelector(".sidebar").getBoundingClientRect().width,
          content: JSON.stringify([stable, [...range.getClientRects()].map((r) => [r.x, r.y, r.width, r.height].map(Math.round))]) });
        if (performance.now() - start < 450) requestAnimationFrame(sample); else resolve(frames);
      };
      requestAnimationFrame(sample);
    });
  });
  await page.mouse.move(34, 50);
  const frames = await page.evaluate(() => window.sidebarAnimation);
  assert.ok(frames.some((frame) => frame.width > 70 && frame.width < 230), "teste deve acompanhar a animação");
  assert.equal(new Set(frames.map((frame) => frame.content)).size, 1, "marca e conteúdo principal não podem se reorganizar durante a expansão");
  await page.screenshot({ path: "test-results/sidebar-expanded.png" });
  await page.mouse.move(500, 50);
  await page.setViewportSize({ width: 1024, height: 900 });
  await checkCards();
  await page.setViewportSize({ width: 360, height: 780 });
  await page.waitForTimeout(250);
  assert.ok(await page.locator(".sidebar").evaluate((node) => node.getBoundingClientRect().right) <= 1, "menu móvel deve iniciar fechado");
  await checkCards();
  await page.screenshot({ path: "test-results/crm-layout-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Abrir navegação", exact: true }).click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator(".sidebar-mini-logo").isVisible(), false, "menu móvel deve mostrar somente o logo completo");
  await page.getByRole("navigation").getByRole("button", { name: "CRM", exact: true }).click();
  await page.getByRole("button", { name: "Abrir oportunidade Obra 0", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  assert.deepEqual(errors, []);
  console.log("PASS: busca identificada; cartões iguais com conteúdo variado; ações sem sobreposição; animação sem reorganizar texto; desktop, tablet e celular");
} finally { await context.close(); await browser.close(); }

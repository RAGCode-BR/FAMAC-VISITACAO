import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { chromium } from "playwright";

// Serve o build na mesma subpasta do GitHub Pages, sem fallback de SPA.
// Assim, URLs incorretas de logo, favicon, JS ou CSS falham com 404.
const base = "/FAMAC-VISITACAO/";
const root = resolve("dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (!url.pathname.startsWith(base)) {
    response.writeHead(404).end();
    return;
  }
  let path = resolve(
    root,
    decodeURIComponent(url.pathname.slice(base.length)) || "index.html",
  );
  if (!path.startsWith(root + sep) && path !== root) {
    response.writeHead(403).end();
    return;
  }
  try {
    if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
    response.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
    });
    response.end(await readFile(path));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({
    executablePath:
      process.env.BROWSER_PATH ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const page = await browser.newPage();
  const errors = [];
  const missing = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (
      response.status() >= 400 &&
      response.url().startsWith("http://127.0.0.1")
    )
      missing.push(response.url());
  });
  const url = `http://127.0.0.1:${server.address().port}${base}`;
  assert.equal((await page.goto(url)).status(), 200);
  await page
    .getByRole("heading", { name: "Cada visita, uma oportunidade." })
    .waitFor();
  await page.locator(".sidebar-brand img").evaluate((image) => image.decode());
  assert.equal(await page.locator(".product-option").count(), 14);
  const favicon = await page.locator('link[rel="icon"]').getAttribute("href");
  assert.equal(
    (await page.request.get(new URL(favicon, url).href)).status(),
    200,
  );
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("button", { name: "Relatórios", exact: true })
    .click();
  await page.locator(".print-heading img").evaluate((image) => image.decode());
  assert.equal(await page.locator(".reports-page").count(), 1);
  await page.reload();
  await page
    .getByRole("heading", { name: "Cada visita, uma oportunidade." })
    .waitFor();
  assert.deepEqual(missing, []);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: build em /FAMAC-VISITACAO/, JS/CSS/logo/favicon, relatórios e recarga sem 404 nem erros de interface",
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

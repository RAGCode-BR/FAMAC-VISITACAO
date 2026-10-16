import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { today } from "../src/lib/domain.mjs";
import pg from "pg";
import { connectionString } from "../server/connection.mjs";

if (!process.env.NEON_BRANCH?.startsWith("famac-e2e-"))
  throw new Error(
    "Este teste grava fixtures e exige uma branch temporária famac-e2e-.",
  );
const accessFile = JSON.parse(
  await readFile("test-results/neon-access.local", "utf8"),
);
if (accessFile.branch !== process.env.NEON_BRANCH)
  throw new Error("O arquivo de acessos pertence a outra branch.");
const { accounts } = accessFile;
const saveAccess = () =>
  writeFile(
    "test-results/neon-access.local",
    JSON.stringify(accessFile, null, 2),
  );
const reset = new pg.Client({
  connectionString: connectionString(process.env.DATABASE_URL),
});
await reset.connect();
try {
  await reset.query("BEGIN");
  await reset.query(
    "TRUNCATE famac.photos, famac.operations, famac.plans, famac.visits, famac.works, famac.contacts",
  );
  await reset.query("UPDATE famac.revision SET value=0 WHERE singleton=true");
  await reset.query("COMMIT");
} finally {
  await reset.end();
}
const base = process.env.NEON_FUNCTION_FAMACAPI_BASE_URL.replace(/\/$/, "");
const response = await fetch(`${base}/state`);
assert.equal(response.status, 401, "API deve recusar acesso sem autenticação");
const origin = "http://127.0.0.1:5174";
let serverOutput = "";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5174",
    "--strictPort",
  ],
  {
    windowsHide: true,
    env: {
      ...process.env,
      VITE_FAMAC_MODE: "cloud",
      VITE_NEON_AUTH_URL: process.env.NEON_AUTH_BASE_URL,
      VITE_FAMAC_API_URL: base,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
server.stdout.on("data", (chunk) => {
  serverOutput += chunk;
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk;
});
await new Promise((resolve, reject) => {
  const timer = setTimeout(
    () => reject(new Error("Vite não iniciou: " + serverOutput)),
    15000,
  );
  server.stdout.on("data", () => {
    if (serverOutput.includes("Local:")) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on("exit", (code) => {
    clearTimeout(timer);
    reject(new Error(`Vite encerrou (${code}): ${serverOutput}`));
  });
});
let browser;
const errors = [];
const call = (page, path, options = {}) =>
  page.evaluate(
    async ({ path, options }) => {
      const { api } = await import("/src/lib/auth.mjs");
      try {
        return { status: 200, data: await api(path, options) };
      } catch (error) {
        return { status: error.status, error: error.message };
      }
    },
    { path, options },
  );
const navigate = (page, name) =>
  page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true })
    .click();
let lastLogin = 0;
async function login(account, viewport) {
  // O provedor limita tentativas de login; contextos novos não removem a cota.
  const remaining = lastLogin + 15000 - Date.now();
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  lastLogin = Date.now();
  const context = await browser.newContext({
    viewport: viewport || { width: 1440, height: 1100 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.getByLabel(/^PIN/).fill(account.pin);
  await page.getByLabel(/^Senha/).fill(account.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.locator(".visit-form").waitFor({ timeout: 30000 });
  return { page, context };
}
async function register(page, name, relationship = false) {
  const form = page.locator(".visit-form");
  await form
    .getByLabel("Nome / identificação da obra", { exact: false })
    .fill(name);
  await form
    .getByLabel("Rua / avenida", { exact: false })
    .fill("Rua de integração");
  await form.getByLabel("Bairro", { exact: false }).fill("Centro");
  await form.getByLabel("Cidade", { exact: false }).fill("São Paulo");
  await form.getByLabel("UF", { exact: false }).fill("SP");
  if (relationship)
    await form
      .getByLabel("Tipo de visita", { exact: true })
      .selectOption("relationship");
  else {
    await form.getByLabel("Oferecer FORRO", { exact: true }).check();
    await form
      .locator("input[type=file][multiple]")
      .setInputFiles("public/famac-logo.jpg");
    await page.locator(".photo-grid img").waitFor();
    await form
      .getByText("Programar uma próxima visita", { exact: true })
      .click();
    await form.getByLabel("Data do retorno", { exact: false }).fill(today());
  }
  await form
    .getByRole("button", { name: "Registrar visita", exact: true })
    .click();
  await page
    .getByText("Visita registrada com sucesso.", { exact: true })
    .waitFor({ timeout: 45000 });
}
try {
  browser = await chromium.launch({
    executablePath:
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
  });
  const claudi = accounts.find((item) => item.teamId === "claudionor");
  const charles = accounts.find((item) => item.teamId === "charles");
  const admin = accounts.find((item) => item.role === "admin");
  const first = await login(claudi);
  assert.equal(await first.page.locator(".topbar select").isDisabled(), true);
  await first.page.reload();
  await first.page.locator(".visit-form").waitFor();
  console.log(
    "PASS: login com PIN e senha, sessão restaurada e colaborador fixado",
  );
  await register(first.page, "Obra de integração Claudionor");
  let stateA = (await call(first.page, "/state")).data;
  assert.equal(stateA.visits.length, 1);
  assert.equal(stateA.plans.length, 1);
  assert.equal(stateA.visits[0].sold.length, 0);
  const photo = stateA.visits[0].photos[0];
  assert.ok(photo.key);
  assert.equal(JSON.stringify(stateA).includes("data:image/"), false);
  const signed = (await call(first.page, `/photos/${photo.id}/url`)).data.url;
  const privateUrl = new URL(signed);
  privateUrl.search = "";
  assert.ok(
    (await fetch(privateUrl)).status >= 400,
    "Foto deve permanecer privada",
  );
  const image = await fetch(signed);
  assert.equal(image.status, 200);
  assert.ok((await image.arrayBuffer()).byteLength > 100);
  await navigate(first.page, "Visitas realizadas");
  await first.page
    .getByRole("button", { name: "Detalhes de Obra de integração Claudionor" })
    .click();
  await first.page.locator(".detail-photos img").waitFor();
  await first.page
    .locator(".detail-photos img")
    .evaluate((image) => image.decode());
  await first.page.getByRole("button", { name: "Fechar detalhes" }).click();
  console.log(
    "PASS: visita de prospecção, obra, retorno, upload no bucket privado e foto no histórico",
  );
  const second = await login(charles);
  assert.equal((await call(second.page, "/state")).data.visits.length, 0);
  await register(second.page, "Obra de integração Charles", true);
  const stateB = (await call(second.page, "/state")).data;
  assert.equal(stateB.visits.length, 1);
  assert.equal(stateB.visits[0].stage, "relationship");
  assert.deepEqual(stateB.visits[0].offered, []);
  assert.equal(
    (await call(second.page, `/photos/${photo.id}/url`)).status,
    403,
  );
  assert.equal((await call(second.page, "/members")).status, 403);
  const forged = structuredClone(stateB);
  forged.visits.push(stateA.visits[0]);
  assert.equal(
    (
      await call(second.page, "/state", {
        method: "PUT",
        body: JSON.stringify({
          state: forged,
          revision: stateB.revision,
          operationId: crypto.randomUUID(),
          actorTeamId: "charles",
        }),
      })
    ).status,
    403,
  );
  console.log(
    "PASS: relacionamento sem produtos e bloqueio de leitura/escrita de outro colaborador",
  );
  const management = await login(admin);
  assert.equal((await call(management.page, "/state")).data.visits.length, 2);
  assert.equal((await call(management.page, "/members")).data.length, 4);
  await navigate(management.page, "Relatórios");
  assert.equal(
    await management.page
      .locator(".metric")
      .first()
      .locator("strong")
      .innerText(),
    "2",
  );
  console.log(
    "PASS: administrador consulta as visitas da equipe e os relatórios consolidados",
  );
  await navigate(management.page, "Colaboradores");
  await management.page
    .getByRole("button", { name: "Redefinir senha de Charles" })
    .click();
  const resetDialog = management.page.getByRole("dialog");
  const resetPassword = charles.password + "Reset";
  await resetDialog.getByLabel(/^Nova senha/).fill(resetPassword);
  await resetDialog.getByLabel(/^Confirmar nova senha/).fill(resetPassword);
  await resetDialog
    .getByRole("button", { name: "Redefinir senha", exact: true })
    .click();
  await management.page
    .getByText("Senha de Charles redefinida.", { exact: true })
    .waitFor();
  charles.password = resetPassword;
  await saveAccess();
  const recovered = await login(charles);
  assert.equal((await call(recovered.page, "/state")).data.visits.length, 1);
  console.log(
    "PASS: administrador redefine senha sem e-mail e colaborador entra com a nova senha",
  );
  await management.page.locator(".topbar select").selectOption("celso");
  await register(management.page, "Obra de integração Celso", true);
  const celso = await login(accounts.find((item) => item.teamId === "celso"));
  assert.equal((await call(celso.page, "/state")).data.visits.length, 1);
  console.log("PASS: administração cadastra para o colaborador selecionado e Celso consulta somente sua visita");
  stateA = (await call(first.page, "/state")).data;
  const operationId = crypto.randomUUID();
  const write = {
    state: stateA,
    revision: stateA.revision,
    operationId,
    actorTeamId: "claudionor",
  };
  assert.equal(
    (
      await call(first.page, "/state", {
        method: "PUT",
        body: JSON.stringify(write),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(first.page, "/state", {
        method: "PUT",
        body: JSON.stringify(write),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(first.page, "/state", {
        method: "PUT",
        body: JSON.stringify({ ...write, operationId: crypto.randomUUID() }),
      })
    ).status,
    409,
  );
  console.log(
    "PASS: salvamento idempotente e proteção contra sobrescrita de dados desatualizados",
  );
  const anotherDevice = await login(claudi);
  assert.equal(
    (await call(anotherDevice.page, "/state")).data.visits.length,
    1,
  );
  await anotherDevice.page
    .getByRole("button", { name: "Alterar senha", exact: true })
    .click();
  const modal = anotherDevice.page.getByRole("dialog");
  await modal.getByLabel(/^Senha atual/).fill(claudi.password);
  const changedPassword = claudi.password + "New";
  await modal.getByLabel(/^Nova senha/).fill(changedPassword);
  await modal.getByLabel(/^Confirmar nova senha/).fill(changedPassword);
  await modal.getByRole("button", { name: "Salvar senha" }).click();
  await modal.getByText("Senha alterada com sucesso.").waitFor();
  claudi.password = changedPassword;
  await saveAccess();
  await modal.getByRole("button", { name: "Concluir" }).click();
  await anotherDevice.page
    .getByRole("button", { name: "Sair", exact: true })
    .click();
  await anotherDevice.page.getByLabel(/^PIN/).waitFor();
  const afterChange = await login(claudi, { width: 390, height: 844 });
  assert.equal((await call(afterChange.page, "/state")).data.visits.length, 1);
  assert.equal(
    await afterChange.page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await afterChange.page.screenshot({
    path: "test-results/neon-mobile.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    "test-results/neon-result.json",
    JSON.stringify(
      {
        branch: process.env.NEON_BRANCH,
        passed: true,
        visits: 3,
        privatePhoto: true,
        ownRecordsOnly: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS: registros em outro dispositivo, troca de senha, saída e acesso em celular",
  );
} catch (error) {
  let message = error.stack || error.message;
  for (const account of accounts)
    message = message.replaceAll(account.password, "[redacted]");
  console.error(message);
  if (browser)
    for (const [index, context] of browser.contexts().entries()) {
      const page = context.pages()[0];
      if (page) {
        console.error("UI:", await page.locator(".error").allTextContents());
        await page
          .screenshot({
            path: `test-results/neon-failure-${index}.png`,
            fullPage: true,
          })
          .catch(() => {});
      }
    }
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}

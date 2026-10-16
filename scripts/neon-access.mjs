import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import pg from "pg";
import { pinIdentity } from "../src/lib/identity.mjs";
import { neonCli } from "./neon-cli.mjs";
import { connectionString } from "../server/connection.mjs";

const branch = process.env.NEON_BRANCH;
if (!branch || !process.env.NEON_AUTH_BASE_URL || !process.env.DATABASE_URL)
  throw new Error(
    "Carregue o arquivo de ambiente da branch antes de criar os acessos.",
  );
const target = process.env.FAMAC_ACCESS_FILE || "famac-acessos.local";
const db = new pg.Client({
  connectionString: connectionString(process.env.DATABASE_URL),
});
await db.connect();
const accounts = [
  { name: "Administrador", pin: "0", teamId: null, role: "admin" },
  {
    name: "Claudionor",
    pin: "1",
    teamId: "claudionor",
    role: "collaborator",
  },
  { name: "Charles", pin: "2", teamId: "charles", role: "collaborator" },
  { name: "Celso", pin: "3", teamId: "celso", role: "collaborator" },
];
const created = [];
try {
  const count = await db.query(
    "SELECT count(*)::int AS total FROM famac.members",
  );
  if (count.rows[0].total)
    throw new Error(
      "Há acessos configurados nesta branch. Nenhuma senha foi substituída.",
    );
  neonCli([
    "neon-auth",
    "config",
    "email-password",
    "update",
    "--branch",
    branch,
    "--enabled",
    "--disable-sign-up=false",
    "--require-email-verification=false",
    "--send-verification-email-on-sign-up=false",
  ]);
  try {
    for (const account of accounts) {
      const password = randomBytes(18).toString("base64url");
      const response = await fetch(
        `${process.env.NEON_AUTH_BASE_URL}/sign-up/email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "http://localhost:5174",
          },
          body: JSON.stringify({
            name: account.name,
            email: pinIdentity(account.pin),
            password,
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
      const body = await response.json();
      if (!response.ok || !body.user?.id)
        throw new Error(
          `Não foi possível criar ${account.name}: ${body.message || response.status}`,
        );
      const authId = body.user.id;
      await db.query(
        "INSERT INTO famac.members(auth_id,name,pin,team_id,role) VALUES ($1,$2,$3,$4,$5)",
        [authId, account.name, account.pin, account.teamId, account.role],
      );
      if (account.role === "admin")
        neonCli([
          "neon-auth",
          "user",
          "set-role",
          authId,
          "--branch",
          branch,
          "--roles",
          "admin",
        ]);
      created.push({ ...account, authId, password });
      // Senhas somente em arquivo local ignorado pelo Git, nunca nos logs.
      await writeFile(
        target,
        JSON.stringify({ branch, accounts: created }, null, 2),
        { mode: 0o600 },
      );
      console.log(`PASS: acesso de ${account.name} configurado`);
    }
  } finally {
    neonCli([
      "neon-auth",
      "config",
      "email-password",
      "update",
      "--branch",
      branch,
      "--disable-sign-up=true",
    ]);
  }
  console.log(`Acessos iniciais gravados somente em ${target}`);
} finally {
  await db.end();
}

import { readFile, readdir } from "node:fs/promises";
import { parseEnv } from "node:util";
const env = {
  ...parseEnv(await readFile(".env.local", "utf8").catch(() => "")),
  ...process.env,
};
const secrets = [
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "NEON_API_KEY",
];
const files = (await readdir("dist/assets")).filter((file) =>
  /\.(js|css)$/.test(file),
);
for (const file of files) {
  const content = await readFile(`dist/assets/${file}`, "utf8");
  for (const name of secrets)
    if (env[name] && content.includes(env[name]))
      throw new Error(
        `Uma credencial ${name} foi incluída no frontend. Publicação bloqueada.`,
      );
}
console.log("PASS: build sem credenciais do banco, bucket ou administração");

import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";

const file = process.argv[2] || ".env.local";
let content = await readFile(file, "utf8");
const env = parseEnv(content);
if (!env.NEON_AUTH_BASE_URL || !env.NEON_FUNCTION_FAMACAPI_BASE_URL)
  throw new Error(
    "Execute neon deploy antes de preparar o ambiente do navegador.",
  );
const publicVars = {
  VITE_FAMAC_MODE: "cloud",
  VITE_NEON_AUTH_URL: env.NEON_AUTH_BASE_URL,
  VITE_FAMAC_API_URL: env.NEON_FUNCTION_FAMACAPI_BASE_URL,
};
content = content
  .split(/\r?\n/)
  .filter(
    (line) =>
      !Object.keys(publicVars).some((name) => line.startsWith(`${name}=`)),
  )
  .join("\n");
await writeFile(
  file,
  content.trimEnd() +
    "\n" +
    Object.entries(publicVars)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") +
    "\n",
);
console.log(
  "PASS: URLs públicas da aplicação configuradas; credenciais do banco e do bucket permanecem no servidor.",
);

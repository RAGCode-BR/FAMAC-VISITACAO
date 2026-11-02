import { spawn } from "node:child_process";

// O modo local sobrepõe .env.local sem ler nem modificar credenciais.
const child = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5174", "--strictPort"], {
  stdio: "inherit", env: { ...process.env, VITE_FAMAC_MODE: "local" },
});
child.on("exit", (code) => process.exit(code || 0));
process.on("SIGINT", () => child.kill("SIGINT"));

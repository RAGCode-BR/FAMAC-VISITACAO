import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export function neonCli(args) {
  const directory = join(process.env.APPDATA, "npm", "node_modules", "neon");
  const pkg = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  const binary = typeof pkg.bin === "string" ? pkg.bin : pkg.bin.neon;
  const result = spawnSync(
    process.execPath,
    [join(directory, binary), ...args],
    { encoding: "utf8", windowsHide: true, timeout: 120000 },
  );
  if (result.status !== 0)
    throw new Error(
      `Neon CLI falhou (${args.slice(0, 3).join(" ")}): ${result.stderr || result.stdout}`,
    );
  return result.stdout;
}

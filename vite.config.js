import { defineConfig, loadEnv } from "vite";

// URLs relativas permitem a mesma versão na raiz local e na pasta do GitHub Pages.
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), "VITE_"), ...process.env };
  if (
    env.VITE_FAMAC_MODE === "cloud" &&
    (!env.VITE_NEON_AUTH_URL || !env.VITE_FAMAC_API_URL)
  )
    throw new Error(
      "Configure VITE_NEON_AUTH_URL e VITE_FAMAC_API_URL para publicar a FAMAC conectada.",
    );
  return { base: "./" };
});

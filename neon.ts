import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  functions: {
    famacapi: {
      name: "FAMAC — visitas e fotos",
      source: "server/index.mjs",
      env: {
        FAMAC_BUCKET: "famac-visitas",
        FAMAC_ORIGINS:
          "https://ragcode-br.github.io,http://127.0.0.1:5174,http://localhost:5174",
      },
    },
  },
  buckets: {
    "famac-visitas": { access: "private" },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Ambientes temporários expiram; a produção mantém suas configurações.
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Middleware de desenvolvimento: nunca faz parte do site compilado.
export function localServicesHistoryPlugin(root) {
  const jobPath = resolve(root, "test-results/services-history-job.local.json");
  const receiptPath = resolve(root, "test-results/services-history-receipt.local.json");
  return {
    name: "famac-local-services-history", apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split("?")[0];
        if (!["/__famac_local/services-history", "/__famac_local/services-history-receipt", "/__famac_local/services-history-cleanup", "/__famac_local/services-history-cleanup-receipt"].includes(path)) return next();
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");
        const peer = req.socket.remoteAddress;
        if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer) || req.headers.host !== "127.0.0.1:5174" || req.headers["sec-fetch-site"] !== "same-origin") { res.statusCode = 403; return res.end(); }
        try {
          const cleanup = path.includes("-cleanup");
          const currentJobPath = cleanup ? resolve(root, "test-results/services-history-cleanup-job.local.json") : jobPath;
          const currentReceiptPath = cleanup ? resolve(root, "test-results/services-history-cleanup-receipt.local.json") : receiptPath;
          const job = JSON.parse(await readFile(currentJobPath, "utf8"));
          if (!path.endsWith("-receipt") && req.method === "GET") { res.setHeader("Content-Type", "application/json; charset=utf-8"); return res.end(JSON.stringify(job)); }
          if (!path.endsWith("-receipt") || req.method !== "POST" || req.headers.origin !== job.targetOrigin) { res.statusCode = 405; return res.end(); }
          let text = "";
          for await (const chunk of req) { text += chunk; if (text.length > 4096) { res.statusCode = 413; return res.end(); } }
          const receipt = JSON.parse(text);
          if (cleanup) {
            if (receipt.id !== job.id || receipt.removedCount !== job.records.length || !Number.isInteger(receipt.remainingCount) || receipt.remainingCount < 0) { res.statusCode = 400; return res.end(); }
            await writeFile(currentReceiptPath, JSON.stringify({ id: receipt.id, appliedAt: receipt.appliedAt, removedCount: receipt.removedCount, remainingCount: receipt.remainingCount, acknowledgedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
            res.statusCode = 204; return res.end();
          }
          if (receipt.id !== job.id || receipt.sourceHash !== job.sourceHash || ![0, 1].includes(receipt.removedTestCount) || !Number.isInteger(receipt.importedCount) || receipt.importedCount < 0 || receipt.importedCount > job.records.length) { res.statusCode = 400; return res.end(); }
          const safeReceipt = Object.fromEntries(["id", "sourceHash", "appliedAt", "importedCount", "skippedCount", "removedTestCount", "serviceCount", "noteCount", "excludedSheets"].map((key) => [key, receipt[key]]));
          await writeFile(receiptPath, JSON.stringify({ ...safeReceipt, acknowledgedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
          res.statusCode = 204; return res.end();
        } catch (error) { res.statusCode = error.code === "ENOENT" ? 204 : 500; return res.end(); }
      });
    },
  };
}

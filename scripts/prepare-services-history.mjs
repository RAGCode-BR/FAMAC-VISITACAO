import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { parseHistoricalEntry, validateHistoryJob } from "../src/lib/service-history.mjs";

const source = JSON.parse(await readFile("test-results/services-history-source.local.json", "utf8"));
if (!source.excludedSheets.includes("Julho")) throw new Error("Extraia a planilha excluindo Julho antes de preparar o plano.");
const job = {
  version: 1, id: `services-history-${source.sourceHash.slice(0, 24)}-exclude-julho-delete-sv1`,
  targetOrigin: "http://127.0.0.1:5174", deleteServiceNumber: 1,
  sourceFile: source.sourceFile, sourceHash: source.sourceHash, excludedSheets: source.excludedSheets,
  records: source.records.map((entry) => ({
    ...entry, id: entry.sourceKey, ...parseHistoricalEntry(entry),
    fingerprint: createHash("sha256").update(JSON.stringify([entry.date, entry.raw, entry.status])).digest("hex"),
  })),
};
validateHistoryJob(job);
await writeFile("test-results/services-history-job.local.json", JSON.stringify(job), { mode: 0o600 });
console.log(JSON.stringify({ prepared: job.records.length, services: job.records.filter((row) => row.kind === "service").length, notes: job.records.filter((row) => row.kind === "note").length, review: job.records.filter((row) => row.needsReview).length, excluded: job.excludedSheets, statusCounts: Object.fromEntries([...new Set(job.records.filter((row) => row.kind === "service").map((row) => row.status))].map((status) => [status, job.records.filter((row) => row.kind === "service" && row.status === status).length])) }));

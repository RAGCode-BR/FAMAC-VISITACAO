import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";
import { connectionString } from "../server/connection.mjs";
import { validateHistoryJob, parseHistoricalEntry } from "../src/lib/service-history.mjs";

const path = process.argv[2];
if (!path) throw new Error("Informe o plano local aplicado e revisado.");
const job = JSON.parse(await readFile(path, "utf8"));
validateHistoryJob(job);
const records = job.records.filter((row) => !parseHistoricalEntry(row).needsReview);
if (records.length !== 1422 || job.records.length - records.length !== 134) throw new Error("O plano difere da seleção histórica autorizada.");
const production = process.env.NEON_BRANCH === "production";
if (production && !process.argv.includes("--production")) throw new Error("Produção exige --production.");
if (!production && !process.env.NEON_BRANCH?.startsWith("famac-e2e-")) throw new Error("Branch não autorizada.");
const apply = process.argv.includes("--apply");
const id = `${job.id}-reviewed-1422`;
const receipt = { id, sourceFile: job.sourceFile, sourceHash: job.sourceHash, importedCount: records.length, excludedSheets: job.excludedSheets, excludedReviewCount: 134, appliedAt: new Date().toISOString() };
if (apply) {
  const db = new pg.Client({ connectionString: connectionString(process.env.DATABASE_URL_UNPOOLED) });
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT value FROM famac.revision WHERE singleton=true FOR UPDATE");
    const existing = await db.query("SELECT id,payload FROM famac.service_history ORDER BY id");
    await writeFile("test-results/services-history-cloud-backup.local.json", JSON.stringify({ branch: process.env.NEON_BRANCH, at: new Date().toISOString(), records: existing.rows }), { mode: 0o600 });
    for (const row of records) {
      const previous = existing.rows.find((item) => item.id === row.id);
      if (previous && previous.payload.fingerprint !== row.fingerprint) throw new Error("Histórico remoto conflitante; importação cancelada.");
    }
    await db.query("INSERT INTO famac.service_history(id,payload) SELECT entry->>'id',entry FROM jsonb_array_elements($1::jsonb) AS entry ON CONFLICT DO NOTHING", [JSON.stringify(records)]);
    await db.query("INSERT INTO famac.service_history_imports(id,payload) VALUES ($1,$2) ON CONFLICT DO NOTHING", [id, receipt]);
    if (existing.rowCount < records.length) await db.query("UPDATE famac.revision SET value=value+1 WHERE singleton=true");
    await db.query("COMMIT");
    await writeFile("test-results/services-history-cloud-receipt.local.json", JSON.stringify({ ...receipt, branch: process.env.NEON_BRANCH }), { mode: 0o600 });
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { await db.end(); }
}
console.log(`PASS: ${apply ? "importação aplicada" : "revisão sem alterações"}; ${records.length} lançamentos, Julho e 134 registros para conferência excluídos; nenhuma venda ou agenda criada.`);

import { randomUUID } from "node:crypto";
import { canAccessServices } from "../src/lib/service-access.mjs";
import { saveService, saveInstaller, changeServiceStatus, decideInstallation } from "../src/lib/services.mjs";
import { fail, validId } from "./policy.mjs";

export function requireServices(member) {
  if (!canAccessServices(member)) fail("Serviços está disponível somente para o administrador e Túlio.", 403);
}
export async function readServices(db) {
  const result = await db.query("SELECT payload FROM famac.service_state WHERE singleton=true");
  const history = await db.query("SELECT payload FROM famac.service_history ORDER BY id");
  const imports = await db.query("SELECT payload FROM famac.service_history_imports ORDER BY id");
  return { ...result.rows[0].payload, serviceHistory: history.rows.map((row) => row.payload), serviceHistoryImports: imports.rows.map((row) => row.payload) };
}
export function applyServiceAction(state, action, member) {
  requireServices(member);
  try {
    if (action?.type === "save") return saveService(state, action.draft, member.name);
    if (action?.type === "installer") return saveInstaller(state, action.draft);
    if (action?.type === "status") return changeServiceStatus(state, action.id, action.status, action.reason, member.name);
    if (action?.type === "decision") return decideInstallation(state, action.saleId, action.decision);
  } catch (error) { fail(error.message); }
  fail("Ação de serviço inválida.");
}
const operationalState = (state) => Object.fromEntries(["services", "installers", "serviceDecisions", "nextInstallationNumber"].map((key) => [key, state[key]]));

export function installServiceRoutes(app, { pool, readState, files }) {
  app.post("/services/actions", async (c) => {
    const member = c.get("member"); requireServices(member);
    const { action, operationId, revision } = await c.req.json();
    if (!validId(operationId) || !Number.isSafeInteger(revision) || revision < 0) fail("Operação inválida.");
    const db = await pool.connect();
    let removed = [];
    try {
      await db.query("BEGIN");
      const current = await db.query("SELECT value FROM famac.revision WHERE singleton=true FOR UPDATE");
      const repeated = await db.query("SELECT auth_id FROM famac.operations WHERE id=$1", [operationId]);
      if (repeated.rowCount) {
        if (repeated.rows[0].auth_id !== member.authId) fail("Operação inválida.", 403);
      } else {
        if (Number(current.rows[0].value) !== revision) fail("Os registros foram atualizados em outro acesso. Seus campos foram mantidos; confira e salve novamente.", 409);
        const before = await readState(db, member);
        if (action?.type === "save") {
          const draft = action.draft;
          if (!draft || draft.id && !validId(draft.id) || !Array.isArray(draft.appointments) || draft.appointments.length > 100 || draft.appointments.some((row) => !validId(row.id)) || !Array.isArray(draft.photos) || draft.photos.length > 6) fail("Dados do serviço inválidos.");
          for (const photo of draft.photos) {
            if (!validId(photo.id) || photo.scope !== "service" || photo.url !== undefined) fail("Foto de serviço inválida.");
            const result = await db.query("SELECT * FROM famac.service_photos WHERE id=$1 FOR UPDATE", [photo.id]);
            const stored = result.rows[0];
            if (!stored || stored.linked && stored.service_id !== draft.id || !stored.linked && stored.uploaded_by !== member.authId) fail("Foto indisponível para este serviço.", 403);
            Object.assign(photo, { key: stored.object_key, name: stored.name });
          }
        }
        if (action?.type === "installer" && action.draft?.id && !validId(action.draft.id)) fail("Profissional inválido.");
        const next = applyServiceAction(before, action, member);
        const ids = new Set(next.services.flatMap((service) => service.photos.map((photo) => photo.id)));
        removed = before.services.flatMap((service) => service.photos).filter((photo) => !ids.has(photo.id));
        for (const service of next.services) for (const photo of service.photos) {
          await db.query("UPDATE famac.service_photos SET linked=true,service_id=$2 WHERE id=$1", [photo.id, service.id]);
        }
        for (const photo of removed) await db.query("UPDATE famac.service_photos SET linked=false WHERE id=$1", [photo.id]);
        await db.query("UPDATE famac.service_state SET payload=$1,updated_at=now() WHERE singleton=true", [operationalState(next)]);
        await db.query("UPDATE famac.revision SET value=value+1 WHERE singleton=true");
        await db.query("INSERT INTO famac.operations(id,auth_id) VALUES ($1,$2)", [operationId, member.authId]);
      }
      const state = await readState(db, member);
      await db.query("COMMIT");
      // Limpeza posterior ao commit; uma falha de armazenamento não desfaz o serviço salvo.
      for (const photo of removed) await removeUnusedPhoto(photo.id).catch(() => {});
      return c.json(state);
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }
  });
  async function removeUnusedPhoto(id, uploader) {
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT value FROM famac.revision WHERE singleton=true FOR UPDATE");
      const row = (await db.query("SELECT * FROM famac.service_photos WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (row && !row.linked && (!uploader || row.uploaded_by === uploader)) {
        await files.delete(row.object_key);
        await db.query("DELETE FROM famac.service_photos WHERE id=$1", [id]);
      }
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }
  }
  app.post("/service-photos", async (c) => {
    const member = c.get("member"); requireServices(member);
    const { name, content } = await c.req.json();
    if (typeof name !== "string" || !name.trim() || name.length > 255 || typeof content !== "string" || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(content)) fail("Envie uma foto JPG válida.");
    const bytes = Buffer.from(content.slice(content.indexOf(",") + 1), "base64");
    if (bytes.length < 4 || bytes.length > 5 * 1024 * 1024 || bytes[0] !== 255 || bytes[1] !== 216) fail("Foto inválida ou maior que 5 MB.");
    const id = randomUUID(), key = `servicos/${id}.jpg`;
    await files.upload(key, bytes, { contentType: "image/jpeg" });
    try {
      await pool.query("INSERT INTO famac.service_photos(id,uploaded_by,object_key,name,bytes) VALUES ($1,$2,$3,$4,$5)", [id, member.authId, key, name, bytes.length]);
    } catch (error) { await files.delete(key).catch(() => {}); throw error; }
    return c.json({ id, key, name, scope: "service" }, 201);
  });
  app.get("/service-photos/:id/url", async (c) => {
    const member = c.get("member"); requireServices(member);
    if (!validId(c.req.param("id"))) fail("Foto inválida.");
    const row = (await pool.query("SELECT * FROM famac.service_photos WHERE id=$1", [c.req.param("id")])).rows[0];
    if (!row || !row.linked && row.uploaded_by !== member.authId) fail("Foto indisponível.", 404);
    return c.json({ url: await files.url(row.object_key, { expiresIn: 300 }) });
  });
  app.delete("/service-photos/:id", async (c) => {
    const member = c.get("member"); requireServices(member);
    if (!validId(c.req.param("id"))) fail("Foto inválida.");
    await removeUnusedPhoto(c.req.param("id"), member.authId);
    return c.body(null, 204);
  });
}

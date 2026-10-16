import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { attachDatabasePool } from "@neon/functions";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { Files } from "files-sdk";
import { neon } from "files-sdk/neon";
import {
  collections,
  validId,
  fail,
  requireOwner,
  requireContactWrite,
  validateState,
  validateRecord,
} from "./policy.mjs";
import { connectionString } from "./connection.mjs";

const pool = new pg.Pool({
  connectionString: connectionString(process.env.DATABASE_URL),
  max: 5,
  connectionTimeoutMillis: 15000,
});
attachDatabasePool(pool);
const jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));
const issuer = new URL(process.env.NEON_AUTH_BASE_URL).origin;
const files = new Files({
  adapter: neon({ bucket: process.env.FAMAC_BUCKET }),
});
const origins = new Set(process.env.FAMAC_ORIGINS.split(","));
const app = new Hono();

app.use("*", async (c, next) => {
  const origin = c.req.header("Origin");
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  if (origin && !origins.has(origin))
    return c.json({ error: "Origem não permitida." }, 403);
  if (origin) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");
    c.header("Access-Control-Allow-Headers", "Authorization,Content-Type");
    c.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  }
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  await next();
});
app.get("/health", (c) => c.json({ status: "ok", application: "famac" }));
app.use("*", async (c, next) => {
  const authorization = c.req.header("Authorization");
  if (!authorization?.startsWith("Bearer "))
    return c.json({ error: "Entre novamente para continuar." }, 401);
  let subject;
  try {
    const { payload } = await jwtVerify(authorization.slice(7), jwks, {
      issuer,
    });
    if (!payload.sub) throw new Error();
    subject = payload.sub;
  } catch {
    return c.json({ error: "Sua sessão expirou. Entre novamente." }, 401);
  }
  // O vínculo é fixado pelo administrador; PIN, role e userId enviados pelo
  // navegador nunca concedem acesso a dados de outra pessoa.
  const result = await pool.query(
    'SELECT auth_id AS "authId", name, pin, team_id AS "teamId", role FROM famac.members WHERE auth_id=$1 AND active=true',
    [subject],
  );
  if (!result.rowCount)
    return c.json({ error: "Este acesso não está autorizado na FAMAC." }, 403);
  c.set("member", result.rows[0]);
  await next();
});
app.use(
  "*",
  bodyLimit({
    maxSize: 8 * 1024 * 1024,
    onError: (c) => c.json({ error: "Arquivo ou registro muito grande." }, 413),
  }),
);

async function readState(db, member, since) {
  const revision = await db.query(
    "SELECT value FROM famac.revision WHERE singleton=true",
  );
  const state = { version: 1, revision: Number(revision.rows[0].value) };
  if (state.revision === since) return null;
  for (const kind of collections) {
    const where =
      kind === "contacts"
        ? "WHERE owner_id=$1 OR payload->>'role' IN ('architect','contractor')"
        : "WHERE owner_id=$1";
    const result = await db.query(
      `SELECT payload, owner_id FROM famac.${kind} ${member.role === "admin" ? "" : where} ORDER BY updated_at,id`,
      member.role === "admin" ? [] : [member.teamId],
    );
    state[kind] = result.rows.map((row) => ({
      ...row.payload,
      ownerId: row.owner_id,
    }));
  }
  return state;
}
async function snapshot(member, since) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const state = await readState(db, member, since);
    await db.query("COMMIT");
    return state;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
app.get("/me", (c) => c.json(c.get("member")));
app.get("/members", async (c) => {
  if (c.get("member").role !== "admin")
    fail("Acesso restrito à administração.", 403);
  const result = await pool.query(
    'SELECT auth_id AS "authId", name, pin, team_id AS "teamId", role FROM famac.members ORDER BY role,name',
  );
  return c.json(result.rows);
});
app.get("/state", async (c) => {
  const raw = c.req.query("since");
  const since = raw === undefined ? undefined : Number(raw);
  if (raw !== undefined && (!/^\d+$/.test(raw) || !Number.isSafeInteger(since)))
    fail("Revisão inválida.");
  const state = await snapshot(c.get("member"), since);
  return state ? c.json(state) : c.body(null, 204);
});
app.get("/operations/:id", async (c) => {
  if (!validId(c.req.param("id"))) fail("Operação inválida.");
  const result = await pool.query(
    "SELECT 1 FROM famac.operations WHERE id=$1 AND auth_id=$2",
    [c.req.param("id"), c.get("member").authId],
  );
  return c.json({ committed: Boolean(result.rowCount) });
});
app.put("/state", async (c) => {
  const member = c.get("member");
  const { state, revision, operationId, actorTeamId } = await c.req.json();
  if (!validId(operationId) || !Number.isSafeInteger(revision) || revision < 0)
    fail("Operação inválida.");
  validateState(state);
  requireOwner(member, actorTeamId);
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const currentRevision = await db.query(
      "SELECT value FROM famac.revision WHERE singleton=true FOR UPDATE",
    );
    const repeated = await db.query(
      "SELECT auth_id FROM famac.operations WHERE id=$1",
      [operationId],
    );
    if (repeated.rowCount) {
      if (repeated.rows[0].auth_id !== member.authId)
        fail("Operação inválida.", 403);
      const saved = await readState(db, member);
      await db.query("COMMIT");
      return c.json(saved);
    }
    if (Number(currentRevision.rows[0].value) !== revision)
      fail(
        "Os registros foram atualizados em outro acesso. Seus campos foram mantidos; confira e salve novamente.",
        409,
      );
    const before = await readState(db, member);
    for (const kind of collections) {
      const incoming = new Map(state[kind].map((row) => [row.id, row]));
      // As telas atuais não excluem cadastros nem histórico.
      if (before[kind].some((row) => !incoming.has(row.id)))
        fail("Não é permitido remover registros do histórico.");
      const previous = new Map(before[kind].map((row) => [row.id, row]));
      for (const record of state[kind]) {
        if (isDeepStrictEqual(previous.get(record.id), record)) continue;
        if (kind === "visits" && previous.has(record.id))
          fail("O histórico de visitas deve ser preservado.");
        const existing = await db.query(
          `SELECT owner_id,payload FROM famac.${kind} WHERE id=$1`,
          [record.id],
        );
        const owner =
          existing.rows[0]?.owner_id ||
          (kind === "visits" || kind === "plans" ? record.userId : actorTeamId);
        if (kind === "contacts")
          requireContactWrite(member, owner, existing.rows[0]?.payload, record);
        else requireOwner(member, owner);
        if (record.ownerId && record.ownerId !== owner)
          fail("Não é permitido transferir a autoria.", 403);
        if ((kind === "visits" || kind === "plans") && record.userId !== owner)
          fail("O colaborador do registro não corresponde à autoria.", 403);
        validateRecord(kind, record);
        const payload = { ...record };
        delete payload.ownerId;
        for (const [key, role] of [
          ["contractorId", "contractor"],
          ["architectId", "architect"],
        ]) {
          if (!record[key]) continue;
          const contact = await db.query(
            "SELECT owner_id,payload FROM famac.contacts WHERE id=$1",
            [record[key]],
          );
          if (!contact.rowCount || contact.rows[0].payload.role !== role)
            fail("Contato indisponível para esta obra.", 403);
        }
        if (kind === "visits" || kind === "plans") {
          const work = await db.query(
            "SELECT owner_id FROM famac.works WHERE id=$1",
            [record.workId],
          );
          if (!work.rowCount || work.rows[0].owner_id !== owner)
            fail("Obra indisponível para este colaborador.", 403);
        }
        if (kind === "visits") {
          const ids = new Set();
          payload.photos = [];
          for (const photo of record.photos) {
            if (!validId(photo.id) || ids.has(photo.id)) fail("Foto inválida.");
            ids.add(photo.id);
            const stored = await db.query(
              "SELECT * FROM famac.photos WHERE id=$1 AND visit_id=$2 AND owner_id=$3",
              [photo.id, record.id, owner],
            );
            if (!stored.rowCount)
              fail("Foto indisponível para esta visita.", 403);
            const item = stored.rows[0];
            payload.photos.push({
              id: item.id,
              name: item.name,
              key: item.object_key,
            });
            await db.query("UPDATE famac.photos SET linked=true WHERE id=$1", [
              item.id,
            ]);
          }
        }
        if (kind === "visits" || kind === "plans")
          await db.query(
            `INSERT INTO famac.${kind}(id,owner_id,work_id,visit_date,payload) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,visit_date=excluded.visit_date,updated_at=now()`,
            [record.id, owner, record.workId, record.date, payload],
          );
        else
          await db.query(
            `INSERT INTO famac.${kind}(id,owner_id,payload) VALUES ($1,$2,$3) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=now()`,
            [record.id, owner, payload],
          );
      }
    }
    await db.query(
      "UPDATE famac.revision SET value=value+1 WHERE singleton=true",
    );
    await db.query("INSERT INTO famac.operations(id,auth_id) VALUES ($1,$2)", [
      operationId,
      member.authId,
    ]);
    const saved = await readState(db, member);
    await db.query("COMMIT");
    return c.json(saved);
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
});
app.post("/photos", async (c) => {
  const member = c.get("member");
  const { visitId, ownerId, name, content } = await c.req.json();
  requireOwner(member, ownerId);
  if (
    !validId(visitId) ||
    typeof name !== "string" ||
    name.length > 255 ||
    typeof content !== "string" ||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(content)
  )
    fail("Envie uma foto JPG válida.");
  const bytes = Buffer.from(content.slice(content.indexOf(",") + 1), "base64");
  if (
    bytes.length < 4 ||
    bytes.length > 5 * 1024 * 1024 ||
    bytes[0] !== 255 ||
    bytes[1] !== 216
  )
    fail("Foto inválida ou maior que 5 MB após a compressão.");
  const id = randomUUID();
  const key = `visitas/${visitId}/${id}.jpg`;
  await files.upload(key, bytes, { contentType: "image/jpeg" });
  try {
    await pool.query(
      "INSERT INTO famac.photos(id,visit_id,owner_id,object_key,name,bytes) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, visitId, ownerId, key, name, bytes.length],
    );
  } catch (error) {
    await files.delete(key).catch(() => {});
    throw error;
  }
  return c.json({ id, key, name }, 201);
});
async function photoFor(member, id) {
  if (!validId(id)) fail("Foto inválida.");
  const result = await pool.query("SELECT * FROM famac.photos WHERE id=$1", [
    id,
  ]);
  if (!result.rowCount) fail("Foto não encontrada.", 404);
  const photo = result.rows[0];
  requireOwner(member, photo.owner_id);
  return photo;
}
app.get("/photos/:id/url", async (c) => {
  const photo = await photoFor(c.get("member"), c.req.param("id"));
  return c.json({ url: await files.url(photo.object_key, { expiresIn: 300 }) });
});
app.delete("/photos/:id", async (c) => {
  const photo = await photoFor(c.get("member"), c.req.param("id"));
  if (photo.linked) fail("Fotos do histórico devem ser preservadas.");
  await files.delete(photo.object_key);
  await pool.query("DELETE FROM famac.photos WHERE id=$1 AND linked=false", [
    photo.id,
  ]);
  return c.body(null, 204);
});
app.onError((error, c) => {
  if (error.status) return c.json({ error: error.message }, error.status);
  if (error instanceof SyntaxError || error instanceof TypeError)
    return c.json({ error: "Formato de dados inválido." }, 400);
  console.error("FAMAC request failed", { code: error.code || "unknown" });
  return c.json({ error: "Não foi possível concluir. Tente novamente." }, 500);
});
app.notFound((c) => c.json({ error: "Recurso não encontrado." }, 404));
export default app;

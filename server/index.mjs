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
  requireCatalogAdmin,
  requireContactWrite,
  requireCatalogChange,
  validateState,
  validateRecord,
} from "./policy.mjs";
import { connectionString } from "./connection.mjs";
import { installCrmRoutes, readCrm, syncVisitCrm } from "./crm-store.mjs";
import {
  productKey,
  productNames,
  catalogProducts,
} from "../src/lib/domain.mjs";

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
      `SELECT payload, owner_id FROM famac.${kind} ${member.role === "admin" || kind === "products" ? "" : where} ORDER BY updated_at,id`,
      member.role === "admin" || kind === "products" ? [] : [member.teamId],
    );
    state[kind] = result.rows.map((row) => ({
      ...row.payload,
      ownerId: row.owner_id,
    }));
  }
  state.crm = await readCrm(db);
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
  const removedProductPhotos = new Set();
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
    if (state.crm !== undefined && !isDeepStrictEqual(state.crm, before.crm))
      fail("O CRM deve ser atualizado pelas ações da oportunidade.", 403);
    if (state.products === undefined) state.products = before.products;
    for (const kind of collections) {
      const incoming = new Map(state[kind].map((row) => [row.id, row]));
      // Exclusão lógica preserva os vínculos e o histórico de todos os usuários.
      if (before[kind].some((row) => !incoming.has(row.id)))
        fail("Não é permitido remover registros do histórico.");
      const previous = new Map(before[kind].map((row) => [row.id, row]));
      for (const record of state[kind]) {
        if (isDeepStrictEqual(previous.get(record.id), record)) continue;
        if (kind === "products") {
          requireCatalogAdmin(member);
          const original = catalogProducts(before, true).find(
            (item) => item.id === record.id,
          );
          const candidate =
            record.photos === undefined && original?.photos
              ? { ...record, photos: original.photos }
              : record;
          requireCatalogChange(original, candidate);
          validateRecord(kind, candidate);
          if (record.ownerId && record.ownerId !== "shared")
            fail("Produto inválido.");
          const payload = {
            id: record.id,
            name: record.name,
            ...(record.deleted ? { deleted: true } : {}),
            photos: [],
          };
          for (const photo of candidate.photos || []) {
            const stored = await db.query(
              "SELECT * FROM famac.product_photos WHERE id=$1 AND product_id=$2 FOR UPDATE",
              [photo.id, record.id],
            );
            if (!stored.rowCount)
              fail("Foto indisponível para este produto.", 403);
            const item = stored.rows[0];
            payload.photos.push({
              id: item.id,
              name: item.name,
              key: item.object_key,
              scope: "product",
            });
            await db.query(
              "UPDATE famac.product_photos SET linked=true WHERE id=$1",
              [item.id],
            );
          }
          for (const photo of original?.photos || []) {
            if (
              record.deleted ||
              !payload.photos.some((item) => item.id === photo.id)
            )
              removedProductPhotos.add(photo.id);
          }
          await db.query(
            "INSERT INTO famac.products(id,name_key,payload) VALUES ($1,$2,$3) ON CONFLICT(id) DO UPDATE SET name_key=excluded.name_key,payload=excluded.payload,updated_at=now()",
            [
              record.id,
              record.deleted ? `deleted:${record.id}` : productKey(record.name),
              payload,
            ],
          );
          continue;
        }
        if (kind === "visits" && previous.has(record.id))
          fail("O histórico de visitas deve ser preservado.");
        const existing = await db.query(
          `SELECT owner_id,payload FROM famac.${kind} WHERE id=$1`,
          [record.id],
        );
        const owner =
          existing.rows[0]?.owner_id ||
          (kind === "visits" || kind === "plans" ? record.userId : actorTeamId);
        if (kind === "contacts") {
          requireContactWrite(member, owner, existing.rows[0]?.payload, record);
          requireCatalogChange(existing.rows[0]?.payload, record);
          if (record.deleted && !existing.rowCount)
            fail("Contato indisponível.");
        } else requireOwner(member, owner);
        if (record.ownerId && record.ownerId !== owner)
          fail("Não é permitido transferir a autoria.", 403);
        if ((kind === "visits" || kind === "plans") && record.userId !== owner)
          fail("O colaborador do registro não corresponde à autoria.", 403);
        validateRecord(kind, record, [
          ...productNames(state),
          ...(kind === "visits"
            ? before.crm.sales.find((sale) => sale.id === record.crmSaleId)
                ?.products || []
            : []),
        ]);
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
          if (contact.rows[0].payload.deleted) {
            let inherited = existing.rows[0]?.payload[key];
            if (!inherited && record.crmOpportunityId)
              inherited = before.crm.opportunities.find(
                (item) => item.id === record.crmOpportunityId,
              )?.work[key];
            if (kind === "visits") {
              const work = await db.query(
                "SELECT payload,owner_id FROM famac.works WHERE id=$1",
                [record.workId],
              );
              if (work.rows[0]?.owner_id === owner)
                inherited = work.rows[0].payload[key];
            }
            if (inherited !== record[key])
              fail("Este contato foi excluído. Selecione outro contato.");
          }
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
        if (kind === "visits") await syncVisitCrm(db, payload, owner, member);
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
    if (removedProductPhotos.size) {
      // A remoção de arquivos só ocorre depois do salvamento confirmado. A nova
      // transação confere novamente os vínculos, serializada com outras edições.
      await deleteUnusedProductPhotos(db, [...removedProductPhotos]).catch(
        () => {
          console.error("FAMAC product photo cleanup failed");
        },
      );
    }
    return c.json(saved);
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
});
installCrmRoutes(app, pool, readState);
const isProductPhotoUsed = (row) =>
  !row.product?.deleted &&
  (row.product?.photos || []).some((photo) => photo.id === row.id);
async function productPhotoFor(db, id) {
  return (
    await db.query(
      "SELECT photo.*,product.payload AS product FROM famac.product_photos photo LEFT JOIN famac.products product ON product.id=photo.product_id WHERE photo.id=$1",
      [id],
    )
  ).rows[0];
}
async function deleteUnusedProductPhotos(db, ids, required = false) {
  await db.query("BEGIN");
  try {
    await db.query(
      "SELECT value FROM famac.revision WHERE singleton=true FOR UPDATE",
    );
    for (const id of ids) {
      const row = await productPhotoFor(db, id);
      if (!row) continue;
      if (isProductPhotoUsed(row)) {
        if (required)
          fail("Remova a foto do produto e salve antes de excluí-la.");
        continue;
      }
      await files.delete(row.object_key);
      await db.query("DELETE FROM famac.product_photos WHERE id=$1", [id]);
    }
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
app.post("/product-photos", async (c) => {
  const member = c.get("member");
  requireCatalogAdmin(member);
  const { productId, name, content } = await c.req.json();
  if (
    !validId(productId) ||
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 255 ||
    typeof content !== "string" ||
    !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(content)
  )
    fail("Envie uma foto JPG válida para o produto.");
  const bytes = Buffer.from(content.slice(content.indexOf(",") + 1), "base64");
  if (
    bytes.length < 4 ||
    bytes.length > 5 * 1024 * 1024 ||
    bytes[0] !== 255 ||
    bytes[1] !== 216
  )
    fail("Foto inválida ou maior que 5 MB após a compressão.");
  const existing = await pool.query(
    "SELECT payload FROM famac.products WHERE id=$1",
    [productId],
  );
  if (existing.rows[0]?.payload.deleted) fail("Este produto já foi excluído.");
  const id = randomUUID();
  const key = `produtos/${productId}/${id}.jpg`;
  await files.upload(key, bytes, { contentType: "image/jpeg" });
  try {
    await pool.query(
      "INSERT INTO famac.product_photos(id,product_id,uploaded_by,object_key,name,bytes) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, productId, member.authId, key, name, bytes.length],
    );
  } catch (error) {
    await files.delete(key).catch(() => {});
    throw error;
  }
  return c.json({ id, key, name, scope: "product" }, 201);
});
app.get("/product-photos/:id/url", async (c) => {
  const id = c.req.param("id");
  if (!validId(id)) fail("Foto inválida.");
  const row = await productPhotoFor(pool, id);
  const member = c.get("member");
  if (
    !row ||
    (!isProductPhotoUsed(row) &&
      !(
        member.role === "admin" &&
        !row.linked &&
        row.uploaded_by === member.authId
      ))
  )
    fail("Foto indisponível para este produto.", 404);
  return c.json({ url: await files.url(row.object_key, { expiresIn: 300 }) });
});
app.delete("/product-photos/:id", async (c) => {
  requireCatalogAdmin(c.get("member"));
  const id = c.req.param("id");
  if (!validId(id)) fail("Foto inválida.");
  const db = await pool.connect();
  try {
    await deleteUnusedProductPhotos(db, [id], true);
  } finally {
    db.release();
  }
  return c.body(null, 204);
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
  if (
    error.code === "23505" &&
    error.constraint === "crm_opportunities_work_key_key"
  )
    return c.json(
      {
        error:
          "Esta obra já possui oportunidade no CRM. Atualize a tela e vincule ao cartão existente.",
      },
      409,
    );
  if (error.code === "23505" && error.constraint === "products_name_key_key")
    return c.json({ error: "Já existe um produto com esse nome." }, 409);
  if (error instanceof SyntaxError || error instanceof TypeError)
    return c.json({ error: "Formato de dados inválido." }, 400);
  console.error("FAMAC request failed", { code: error.code || "unknown" });
  return c.json({ error: "Não foi possível concluir. Tente novamente." }, 500);
});
app.notFound((c) => c.json({ error: "Recurso não encontrado." }, 404));
export default app;

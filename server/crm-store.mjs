import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import {
  applyCrmAction,
  canSeeCrmOpportunity,
  createCrmOpportunity,
  changeCrmColumns,
  emptyCrm,
  markCrmVisitDeleted,
  recordCrmVisit,
} from "../src/lib/crm.mjs";
import { normalize, person, productNames } from "../src/lib/domain.mjs";
import { sellerAssignments } from "../src/lib/seller-notifications.mjs";
import { validId, fail, requireOwner } from "./policy.mjs";

export async function readCrm(db) {
  const crm = emptyCrm();
  for (const [kind, table] of [
    ["opportunities", "crm_opportunities"],
    ["activities", "crm_activities"],
    ["sales", "crm_sales"],
    ["visitLinks", "crm_visit_links"],
  ]) {
    crm[kind] = (
      await db.query(
        `SELECT payload FROM famac.${table} ORDER BY payload->>'id',payload->>'visitId'`,
      )
    ).rows.map((row) => row.payload);
  }
  crm.opportunities.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  crm.activities.sort((a, b) => b.at.localeCompare(a.at));
  const settings = (await db.query("SELECT stage_labels,stage_order FROM famac.crm_settings WHERE singleton=true")).rows[0];
  crm.stageLabels = settings?.stage_labels || crm.stageLabels;
  crm.stageOrder = settings?.stage_order || crm.stageOrder;
  return crm;
}
export async function persistCrm(db, before, after, { notify = true, actorName = "Equipe FAMAC" } = {}) {
  for (const row of after.opportunities) {
    if (
      isDeepStrictEqual(
        before.opportunities.find((item) => item.id === row.id),
        row,
      )
    )
      continue;
    await db.query(
      "INSERT INTO famac.crm_opportunities(id,work_key,payload) VALUES ($1,$2,$3) ON CONFLICT(id) DO UPDATE SET work_key=excluded.work_key,payload=excluded.payload,updated_at=now()",
      [row.id, row.workKey, row],
    );
  }
  for (const row of after.activities) {
    if (before.activities.some((item) => item.id === row.id)) continue;
    await db.query(
      "INSERT INTO famac.crm_activities(id,opportunity_id,payload) VALUES ($1,$2,$3)",
      [row.id, row.opportunityId, row],
    );
  }
  for (const row of after.sales) {
    if (
      isDeepStrictEqual(
        before.sales.find((item) => item.id === row.id),
        row,
      )
    )
      continue;
    await db.query(
      "INSERT INTO famac.crm_sales(id,opportunity_id,source_visit_id,payload) VALUES ($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET source_visit_id=excluded.source_visit_id,payload=excluded.payload",
      [row.id, row.opportunityId, row.sourceVisitId, row],
    );
  }
  for (const row of after.visitLinks) {
    const original = before.visitLinks.find((item) => item.visitId === row.visitId);
    if (isDeepStrictEqual(original, row)) continue;
    await db.query(
      "INSERT INTO famac.crm_visit_links(visit_id,opportunity_id,payload) VALUES ($1,$2,$3) ON CONFLICT(visit_id) DO UPDATE SET payload=excluded.payload",
      [row.visitId, row.opportunityId, row],
    );
  }
  if (notify) for (const row of sellerAssignments(before, after)) {
    const recipient = await db.query(
      "SELECT 1 FROM famac.members WHERE team_id=$1 AND active=true AND role='collaborator'",
      [row.responsibleId],
    );
    if (!recipient.rowCount) fail("O vendedor selecionado ainda não possui acesso ativo.");
    await db.query(
      "UPDATE famac.notifications SET read_at=now() WHERE opportunity_id=$1 AND read_at IS NULL",
      [row.id],
    );
    await db.query(
      "INSERT INTO famac.notifications(id,recipient_team_id,opportunity_id,kind,work_name,actor_name) VALUES ($1,$2,$3,'seller_assigned',$4,$5)",
      [randomUUID(), row.responsibleId, row.id, row.work.name, actorName],
    );
  }
}
export async function deleteCrmVisit(db, visitId, actor) {
  const before = await readCrm(db);
  const after = markCrmVisitDeleted(before, visitId, actor);
  await persistCrm(db, before, after);
}
export async function syncVisitCrm(
  db,
  visit,
  owner,
  member,
  historical = false,
) {
  const work = (
    await db.query(
      "SELECT payload FROM famac.works WHERE id=$1 AND owner_id=$2",
      [visit.workId, owner],
    )
  ).rows[0]?.payload;
  if (!work) fail("Obra indisponível para esta visita.", 403);
  const before = await readCrm(db);
  const actor = historical
    ? { name: person(owner), teamId: owner }
    : { ...member, teamId: member.teamId || owner };
  const result = recordCrmVisit(before, visit, work, actor, { historical });
  await persistCrm(db, before, result.crm, {
    notify: !historical,
    actorName: historical ? person(owner) : member.name,
  });
  if (result.opportunityId && work.crmOpportunityId !== result.opportunityId)
    await db.query(
      "UPDATE famac.works SET payload=payload || jsonb_build_object('crmOpportunityId',$2::text),updated_at=now() WHERE id=$1",
      [work.id, result.opportunityId],
    );
  return result.opportunityId;
}
export async function backfillCrm(db) {
  const exists = await db.query(
    "SELECT to_regclass('famac.crm_opportunities') AS name",
  );
  if (!exists.rows[0].name) return;
  await db.query(
    "SELECT value FROM famac.revision WHERE singleton=true FOR UPDATE",
  );
  const result = await db.query(
    "SELECT v.payload,v.owner_id FROM famac.visits v WHERE NOT EXISTS (SELECT 1 FROM famac.crm_visit_links l WHERE l.visit_id=v.id) AND v.payload->>'deleted' IS DISTINCT FROM 'true' AND COALESCE(v.payload->>'crmEnabled','')<>'false' ORDER BY v.visit_date,v.updated_at,v.id",
  );
  let integrated = 0;
  for (const row of result.rows)
    if (await syncVisitCrm(db, row.payload, row.owner_id, {}, true))
      integrated++;
  if (integrated) {
    await db.query(
      "UPDATE famac.revision SET value=value+1 WHERE singleton=true",
    );
    console.log(
      `PASS: ${integrated} visitas integradas ao CRM sem alterar seu histórico`,
    );
  }
}

export function installCrmRoutes(app, pool, readState) {
  app.get("/crm/:id/prospecting", async (c) => {
    const opportunityId = c.req.param("id");
    if (!validId(opportunityId)) fail("Oportunidade inválida.");
    const member = c.get("member");
    const opportunity = await pool.query(
      "SELECT payload FROM famac.crm_opportunities WHERE id=$1",
      [opportunityId],
    );
    if (!opportunity.rowCount || opportunity.rows[0].payload.deleted)
      fail("Oportunidade não encontrada.", 404);
    if (!["admin", "supervisor"].includes(member.role) &&
      member.teamId !== opportunity.rows[0].payload.responsibleId)
      fail("Somente o vendedor designado pode consultar os registros da prospecção.", 403);
    const rows = await pool.query(
      `SELECT v.id,v.owner_id,v.payload FROM famac.crm_visit_links link
       JOIN famac.visits v ON v.id=link.visit_id
       WHERE link.opportunity_id=$1
         AND link.payload->>'deleted' IS DISTINCT FROM 'true'
         AND v.payload->>'deleted' IS DISTINCT FROM 'true'
       ORDER BY v.visit_date DESC,v.updated_at DESC,v.id`,
      [opportunityId],
    );
    return c.json(rows.rows.map(({ id, owner_id: ownerId, payload }) => ({
      id,
      userId: ownerId,
      date: payload.date,
      source: payload.source === "lead" ? "lead" : "visit",
      stage: payload.stage,
      offered: Array.isArray(payload.offered) ? payload.offered : [],
      sold: Array.isArray(payload.sold) ? payload.sold : [],
      notes: typeof payload.notes === "string" ? payload.notes : "",
      photos: Array.isArray(payload.photos)
        ? payload.photos.map((photo) => ({ id: photo.id, name: photo.name, key: photo.key }))
        : [],
    })));
  });
  app.post("/crm/opportunities", async (c) => {
    const member = c.get("member");
    const { workId, stage, actorTeamId, operationId } = await c.req.json();
    if (!validId(workId) || !validId(operationId)) fail("Operação do CRM inválida.");
    requireOwner(member, actorTeamId);
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT value FROM famac.revision WHERE singleton=true FOR UPDATE");
      const repeated = await db.query("SELECT auth_id FROM famac.operations WHERE id=$1", [operationId]);
      if (repeated.rowCount) {
        if (repeated.rows[0].auth_id !== member.authId) fail("Operação inválida.", 403);
      } else {
        const work = await db.query("SELECT owner_id,payload FROM famac.works WHERE id=$1", [workId]);
        if (!work.rowCount || work.rows[0].payload.deleted) fail("Obra indisponível.", 404);
        requireOwner(member, work.rows[0].owner_id);
        const before = await readCrm(db);
        const after = createCrmOpportunity(before, work.rows[0].payload, { ...member, teamId: work.rows[0].owner_id }, { stage });
        await persistCrm(db, before, after, { actorName: member.name });
        await db.query("UPDATE famac.revision SET value=value+1 WHERE singleton=true");
        await db.query("INSERT INTO famac.operations(id,auth_id) VALUES ($1,$2)", [operationId, member.authId]);
      }
      const state = await readState(db, member);
      await db.query("COMMIT");
      return c.json(state);
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }
  });
  app.post("/crm/columns", async (c) => {
    const member = c.get("member");
    if (!["admin", "supervisor"].includes(member.role)) fail("Somente a gestão pode gerenciar colunas.", 403);
    const { action, operationId } = await c.req.json();
    if (!validId(operationId) || !action || !["add", "delete", "reorder"].includes(action.type))
      fail("Operação de coluna inválida.");
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT value FROM famac.revision WHERE singleton=true FOR UPDATE");
      const repeated = await db.query("SELECT auth_id FROM famac.operations WHERE id=$1", [operationId]);
      if (repeated.rowCount) {
        if (repeated.rows[0].auth_id !== member.authId) fail("Operação inválida.", 403);
      } else {
        const before = await readCrm(db);
        const after = changeCrmColumns(before, action, member);
        await persistCrm(db, before, after, { actorName: member.name });
        await db.query("UPDATE famac.crm_settings SET stage_labels=$1,stage_order=$2 WHERE singleton=true",
          [after.stageLabels, JSON.stringify(after.stageOrder)]);
        await db.query("UPDATE famac.revision SET value=value+1 WHERE singleton=true");
        await db.query("INSERT INTO famac.operations(id,auth_id) VALUES ($1,$2)", [operationId, member.authId]);
      }
      const state = await readState(db, member);
      await db.query("COMMIT");
      return c.json(state);
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }
  });
  app.put("/crm/stage-labels", async (c) => {
    const member = c.get("member");
    if (!["admin", "supervisor"].includes(member.role)) fail("Somente a gestão pode renomear colunas.", 403);
    const { labels, operationId } = await c.req.json();
    if (!validId(operationId) || !labels || typeof labels !== "object" || Array.isArray(labels))
      fail("Nomes de colunas inválidos.");
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT value FROM famac.revision WHERE singleton=true FOR UPDATE");
      const repeated = await db.query("SELECT auth_id FROM famac.operations WHERE id=$1", [operationId]);
      if (repeated.rowCount) {
        if (repeated.rows[0].auth_id !== member.authId) fail("Operação inválida.", 403);
      } else {
        const settings = (await db.query("SELECT stage_labels,stage_order FROM famac.crm_settings WHERE singleton=true FOR UPDATE")).rows[0];
        if (Object.keys(labels).sort().join(",") !== Object.keys(settings.stage_labels).sort().join(","))
          fail("As colunas mudaram. Atualize o CRM e tente novamente.", 409);
        if (Object.values(labels).some((value) => typeof value !== "string" || !value.trim() || value.trim().length > 35) ||
          new Set(settings.stage_order.map((id) => normalize(labels[id]))).size !== settings.stage_order.length)
          fail("Informe nomes diferentes, com até 35 caracteres.");
        await db.query("UPDATE famac.crm_settings SET stage_labels=$1 WHERE singleton=true", [Object.fromEntries(Object.entries(labels).map(([key,value]) => [key,value.trim()]))]);
        await db.query("UPDATE famac.revision SET value=value+1 WHERE singleton=true");
        await db.query("INSERT INTO famac.operations(id,auth_id) VALUES ($1,$2)", [operationId, member.authId]);
      }
      const state = await readState(db, member);
      await db.query("COMMIT");
      return c.json(state);
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }
  });
  app.post("/crm/:id/actions", async (c) => {
    const member = c.get("member");
    const body = await c.req.json();
    const opportunityId = c.req.param("id");
    if (!validId(opportunityId) || !validId(body.operationId))
      fail("Operação do CRM inválida.");
    requireOwner(member, body.actorTeamId);
    const db = await pool.connect();
    try {
      await db.query("BEGIN");
      await db.query(
        "SELECT value FROM famac.revision WHERE singleton=true FOR UPDATE",
      );
      const repeated = await db.query(
        "SELECT auth_id FROM famac.operations WHERE id=$1",
        [body.operationId],
      );
      if (repeated.rowCount) {
        if (repeated.rows[0].auth_id !== member.authId)
          fail("Operação inválida.", 403);
      } else {
        const before = await readCrm(db);
        if (!canSeeCrmOpportunity(before,
          before.opportunities.find((item) => item.id === opportunityId), member))
          fail("Oportunidade indisponível para este usuário.", 403);
        const state = await readState(db, member);
        const actor = { ...member, teamId: member.teamId || body.actorTeamId };
        const after = applyCrmAction(
          before,
          opportunityId,
          body.action || {},
          actor,
          productNames(state),
        );
        await persistCrm(db, before, after, { actorName: member.name });
        await db.query(
          "UPDATE famac.revision SET value=value+1 WHERE singleton=true",
        );
        await db.query(
          "INSERT INTO famac.operations(id,auth_id) VALUES ($1,$2)",
          [body.operationId, member.authId],
        );
      }
      const state = await readState(db, member);
      await db.query("COMMIT");
      return c.json(state);
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  });
}

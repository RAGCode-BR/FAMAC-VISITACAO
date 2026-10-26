import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyData,
  newVisit,
  person,
  recordVisit,
  today,
} from "../src/lib/domain.mjs";
import {
  applyCrmAction,
  businessSales,
  emptyCrm,
  filterBusinessSales,
  reconcileLocalCrm,
  recordCrmVisit,
  crmWorkKey,
  crmTimeline,
  markCrmVisitDeleted,
  createCrmOpportunity,
  assignCrmSeller,
  changeCrmColumns,
  crmActiveStageIds,
} from "../src/lib/crm.mjs";
import { sellerAssignments } from "../src/lib/seller-notifications.mjs";

test("vendedor atribuído recebe um aviso por atribuição, sem transferir a prospecção", () => {
  const work = { id: crypto.randomUUID(), name: "Obra exemplo", street: "Rua A",
    number: "10", neighborhood: "Centro", city: "Sorriso", state: "MT" };
  const actor = { role: "collaborator", teamId: "claudionor", name: "Claudionor" };
  const visit = { ...newVisit("claudionor"), id: crypto.randomUUID(),
    workId: work.id, workName: work.name, date: today(), offered: ["FORRO"],
    sellerId: "charles", photos: [{ id: crypto.randomUUID() }], notes: "Anotação privada" };
  const first = recordCrmVisit(emptyCrm(), visit, work, actor).crm;
  assert.equal(first.opportunities[0].prospectorId, "claudionor");
  assert.equal(first.opportunities[0].responsibleId, "charles");
  assert.deepEqual(sellerAssignments(emptyCrm(), first).map((item) => item.responsibleId), ["charles"]);
  assert.ok(!JSON.stringify(first).includes("Anotação privada"));
  assert.ok(!JSON.stringify(first).includes(visit.photos[0].id));
  const second = recordCrmVisit(first, { ...visit, id: crypto.randomUUID(),
    userId: "celso", sellerId: "", photos: [], notes: "" }, work,
    { role: "collaborator", teamId: "celso", name: "Celso" }).crm;
  assert.equal(second.opportunities[0].responsibleId, "charles");
  assert.equal(sellerAssignments(first, second).length, 0);
  const third = assignCrmSeller(second, work, "celso", actor);
  assert.equal(third.opportunities[0].responsibleId, "celso");
  assert.deepEqual(sellerAssignments(second, third).map((item) => item.responsibleId), ["celso"]);
  assert.equal(sellerAssignments(third, assignCrmSeller(third, work, "celso", actor)).length, 0);
  assert.throws(() => assignCrmSeller(third, work, "desconhecido", actor), /vendedor válido/);
});

test("excluir coluna com cartões move os ativos e preserva o histórico", () => {
  const actor = { role: "admin", teamId: "claudionor", name: "Administrador" };
  const work = { id: crypto.randomUUID(), name: "Hotel", street: "Rua A", number: "10", neighborhood: "Centro", city: "Sorriso", state: "MT" };
  const added = changeCrmColumns(emptyCrm(), { type: "add", name: "Aguardando proposta" });
  const stage = added.stageOrder.find((id) => id.startsWith("custom-"));
  assert.equal(added.stageLabels[stage], "Aguardando proposta");
  assert.ok(crmActiveStageIds(added).includes(stage));
  assert.throws(() => changeCrmColumns(added, { type: "add", name: "aguardando proposta" }), /já existe/i);
  const withCard = createCrmOpportunity(added, work, actor, { stage });
  assert.equal(withCard.opportunities[0].stage, stage);
  const removed = changeCrmColumns(withCard, { type: "delete", stage }, actor);
  assert.ok(!removed.stageOrder.includes(stage));
  assert.equal(removed.opportunities[0].stage, "prospecting");
  assert.equal(removed.opportunities[0].version, 2);
  assert.equal(removed.stageLabels[stage], "Aguardando proposta");
  assert.equal(removed.activities.at(-1).from, stage);
  assert.equal(removed.activities.at(-1).to, "prospecting");
  assert.match(removed.activities.at(-1).note, /Coluna Aguardando proposta excluída/);
  assert.throws(() => changeCrmColumns(removed, { type: "delete", stage }), /não encontrada/);
});

test("cartão manual pode ser ocultado e reaberto sem perder vendas e histórico", () => {
  const work = { id: crypto.randomUUID(), name: "Hotel", street: "Rua A", number: "10", complement: "", neighborhood: "Centro", city: "Sorriso", state: "MT", type: "Comercial" };
  const actor = { role: "collaborator", teamId: "claudionor", name: "Claudionor" };
  const created = createCrmOpportunity(emptyCrm(), work, actor);
  const item = created.opportunities[0];
  assert.equal(item.stage, "prospecting");
  assert.throws(() => createCrmOpportunity(created, work, actor), /já possui/);
  created.sales.push({ id: crypto.randomUUID(), opportunityId: item.id, value: 500 });
  const hidden = applyCrmAction(created, item.id, { type: "delete", version: item.version }, actor, []);
  assert.equal(hidden.opportunities[0].deleted, true);
  assert.equal(hidden.sales[0].value, 500);
  assert.equal(hidden.activities.at(-1).type, "deleted");
  const restored = createCrmOpportunity(hidden, work, actor);
  assert.equal(restored.opportunities.length, 1);
  assert.equal(restored.opportunities[0].deleted, false);
  assert.equal(restored.sales[0].value, 500);
});

test("histórico mostra venda acima da visita do mesmo salvamento sem reordenar ações independentes", () => {
  const events = [
    {
      id: "created",
      opportunityId: "a",
      sequence: 1,
      type: "created",
      at: "2026-10-16T20:00:00Z",
    },
    {
      id: "sale",
      opportunityId: "a",
      sequence: 2,
      type: "sale",
      sourceVisitId: "visit1",
      at: "2026-10-16T20:00:00Z",
    },
    {
      id: "visit",
      opportunityId: "a",
      sequence: 3,
      type: "visit",
      sourceVisitId: "visit1",
      at: "2026-10-16T20:00:00Z",
    },
    {
      id: "note",
      opportunityId: "a",
      sequence: 4,
      type: "note",
      at: "2026-10-16T20:00:00Z",
    },
    {
      id: "other",
      opportunityId: "b",
      sequence: 5,
      type: "note",
      at: "2026-10-16T20:00:00Z",
    },
  ];
  const original = structuredClone(events);
  assert.deepEqual(
    crmTimeline(events, "a").map((event) => event.id),
    ["note", "sale", "visit", "created"],
  );
  assert.deepEqual(events, original);
  for (const different of [
    { ...events[2], at: "2026-10-16T20:01:00Z" },
    { ...events[2], sourceVisitId: "visit2" },
    { ...events[2], sourceVisitId: undefined, linkedSaleId: "sale" },
  ]) {
    assert.deepEqual(
      crmTimeline([events[1], different], "a").map((event) => event.id),
      ["visit", "sale"],
    );
  }
});

test("obras sem número e S/N usam o nome para não unir obras diferentes na mesma rua", () => {
  const work = {
    name: "Obra A",
    street: "Rua teste",
    number: "S/N",
    neighborhood: "Centro",
    city: "Sorriso",
    state: "MT",
  };
  assert.equal(crmWorkKey(work), crmWorkKey({ ...work, number: "" }));
  assert.notEqual(crmWorkKey(work), crmWorkKey({ ...work, name: "Obra B" }));
});
const actor = (id) => ({ teamId: id, name: person(id), role: "collaborator" });
const draft = (extra = {}) => ({
  ...newVisit("claudionor"),
  workName: "Obra CRM teste",
  street: "Rua Teste",
  number: "15",
  neighborhood: "Centro",
  city: "Sorriso",
  state: "MT",
  offered: ["FORRO", "GESSO"],
  ...extra,
  stage: extra.stage || (extra.sold?.length ? "closing" : "prospecting"),
});
function seed() {
  return reconcileLocalCrm(
    recordVisit(
      emptyData(),
      draft({
        notes: "NOTA PRIVADA",
        photos: [{ id: crypto.randomUUID(), key: "foto-privada.jpg" }],
      }),
    ),
    actor("claudionor"),
  );
}
const act = (crm, action, id = "charles") =>
  applyCrmAction(
    crm,
    crm.opportunities[0].id,
    { version: crm.opportunities[0].version, ...action },
    actor(id),
    ["FORRO", "GESSO"],
  );
test("visitas alimentam uma oportunidade por obra e não compartilham fotos nem notas privadas", () => {
  let data = seed();
  const opp = data.crm.opportunities[0];
  assert.equal(opp.prospectorId, "claudionor");
  assert.deepEqual(opp.pendingProducts, ["FORRO", "GESSO"]);
  assert.equal(JSON.stringify(data.crm).includes("NOTA PRIVADA"), false);
  assert.equal(JSON.stringify(data.crm).includes("foto-privada"), false);
  const original = structuredClone(data.visits[0]);
  data = reconcileLocalCrm(
    recordVisit(
      data,
      draft({
        userId: "charles",
        workName: "Nome diferente para a mesma obra",
      }),
    ),
    actor("charles"),
  );
  assert.equal(data.crm.opportunities.length, 1);
  assert.equal(data.crm.visitLinks.length, 2);
  assert.deepEqual(data.visits[0], original);
  assert.equal(data.crm.opportunities[0].prospectorId, "claudionor");
  assert.equal(reconcileLocalCrm(data).crm.visitLinks.length, 2);
});
test("excluir uma visita oculta sua ação, mantém a venda e preserva a auditoria", () => {
  const data = reconcileLocalCrm(
    recordVisit(
      emptyData(),
      draft({ sold: ["FORRO"], saleValue: 350, stage: "closing" }),
    ),
    actor("claudionor"),
  );
  const visitId = data.visits[0].id;
  const crm = markCrmVisitDeleted(
    data.crm,
    visitId,
    actor("claudionor"),
    "2026-10-19T12:00:00.000Z",
  );
  assert.equal(crm.visitLinks[0].deleted, true);
  assert.equal(crm.opportunities[0].lastVisitDate, "");
  assert.deepEqual(
    crmTimeline(crm.activities, crm.opportunities[0].id)
      .filter((event) => ["visit", "visit_deleted", "sale"].includes(event.type))
      .map((event) => event.type),
    ["visit_deleted", "sale"],
  );
  assert.equal(
    businessSales({ ...data, crm, visits: [] })[0].value,
    350,
  );
  assert.deepEqual(markCrmVisitDeleted(crm, visitId, actor("claudionor")), crm);
});
test("equipe negocia e vende parcialmente; o último produto conclui sem duplicar valores", () => {
  let data = seed();
  let crm = act(data.crm, {
    type: "update",
    stage: "waiting",
    responsibleId: "charles",
    nextAction: "Ligar para arquiteto",
    nextDate: today(),
    note: "Contato iniciado",
  });
  crm = act(crm, {
    type: "sale",
    products: ["FORRO"],
    value: "1500.55",
    date: today(),
    sellerTeamId: "charles",
  });
  assert.equal(crm.opportunities[0].stage, "negotiating");
  assert.deepEqual(crm.opportunities[0].pendingProducts, ["GESSO"]);
  assert.throws(
    () =>
      act(crm, {
        type: "sale",
        products: ["FORRO"],
        value: 100,
        date: today(),
        sellerTeamId: "charles",
      }),
    /já foi vendido/,
  );
  crm = act(
    crm,
    {
      type: "sale",
      products: ["GESSO"],
      value: 300,
      date: today(),
      sellerTeamId: "celso",
    },
    "celso",
  );
  assert.equal(crm.opportunities[0].stage, "won");
  assert.equal(crm.sales.length, 2);
  const facts = businessSales({ ...data, crm });
  assert.equal(
    facts.reduce((sum, item) => sum + item.value, 0),
    1800.55,
  );
  assert.equal(
    filterBusinessSales(facts, {
      userId: "celso",
      product: "GESSO",
      neighborhood: "centro",
    }).length,
    1,
  );
  assert.equal(crm.sales[1].prospectorId, "claudionor");
});
test("vincular visita a uma venda existente conserva o vendedor e não gera outro fechamento", () => {
  let data = seed();
  data.crm = act(data.crm, {
    type: "sale",
    products: ["FORRO"],
    value: 500,
    date: today(),
    sellerTeamId: "charles",
  });
  const sale = data.crm.sales[0];
  const opp = data.crm.opportunities[0];
  data = reconcileLocalCrm(
    recordVisit(
      data,
      draft({
        userId: "charles",
        crmOpportunityId: opp.id,
        crmSaleId: sale.id,
        offered: ["FORRO"],
        sold: ["FORRO"],
        saleValue: 500,
      }),
    ),
    actor("charles"),
  );
  assert.equal(data.crm.sales.length, 1);
  assert.equal(businessSales(data).length, 1);
  assert.equal(data.crm.sales[0].sourceVisitId, data.visits[1].id);
  assert.throws(
    () =>
      reconcileLocalCrm(
        recordVisit(
          data,
          draft({
            userId: "charles",
            crmOpportunityId: opp.id,
            crmSaleId: sale.id,
            offered: ["FORRO"],
            sold: ["FORRO"],
            saleValue: 500,
          }),
        ),
        actor("charles"),
      ),
    /não está disponível/,
  );
});
test("venda na visita e no CRM usa o mesmo registro financeiro", () => {
  const data = reconcileLocalCrm(
    recordVisit(emptyData(), draft({ sold: ["FORRO"], saleValue: 800 })),
    actor("claudionor"),
  );
  assert.equal(data.crm.sales.length, 1);
  assert.equal(data.crm.sales[0].sourceVisitId, data.visits[0].id);
  assert.equal(businessSales(data).length, 1);
});
test("versão impede sobrescrita e o servidor valida vendedor, datas e encerramentos", () => {
  const data = seed();
  const crm = data.crm;
  const id = crm.opportunities[0].id;
  assert.throws(
    () =>
      applyCrmAction(
        crm,
        id,
        { type: "note", version: 0, note: "Alteração desatualizada" },
        actor("charles"),
        [],
      ),
    { status: 409 },
  );
  assert.throws(
    () =>
      act(crm, {
        type: "sale",
        products: ["FORRO"],
        date: today(),
        value: 1,
        sellerTeamId: "celso",
      }),
    { status: 403 },
  );
  for (const date of ["2026-02-30", "2026-99-99", "2099-01-01"])
    assert.throws(() =>
      act(crm, {
        type: "sale",
        products: ["FORRO"],
        date,
        value: 1,
        sellerTeamId: "charles",
      }),
    );
  assert.throws(() => act(crm, { type: "lose", note: "" }), /motivo/);
  assert.throws(
    () => act(crm, { type: "update", stage: "won", responsibleId: "charles" }),
    /etapa/,
  );
  let changed = act(crm, { type: "lose", note: "Obra suspensa" });
  changed = act(changed, {
    type: "reopen",
    note: "Cliente retomou o contato",
    products: ["GESSO"],
  });
  assert.equal(changed.opportunities[0].cycle, 2);
  assert.equal(changed.opportunities[0].stage, "prospecting");
});
test("histórico legado é conciliado sem apagar vendas e relacionamento pode ficar fora do CRM", () => {
  let data = recordVisit(
    emptyData(),
    draft({ stage: "relationship", crmEnabled: false, offered: [] }),
  );
  assert.equal(reconcileLocalCrm(data).crm.opportunities.length, 0);
  data = recordVisit(data, draft({ sold: ["FORRO", "GESSO"], saleValue: 100 }));
  data = recordVisit(data, draft({ sold: ["FORRO", "GESSO"], saleValue: 200 }));
  data = reconcileLocalCrm(data, null, true);
  assert.equal(data.crm.opportunities.length, 1);
  assert.equal(data.crm.sales.length, 2);
  assert.equal(businessSales(data).length, 2);
});

test("concluir venda parcial encerra apenas os itens restantes e reabrir permite outra negociação", () => {
  let crm = seed().crm;
  crm = act(crm, {
    type: "sale",
    products: ["FORRO"],
    value: 100,
    date: today(),
    sellerTeamId: "charles",
  });
  assert.throws(() => act(crm, { type: "complete", note: "" }), /Explique/);
  crm = act(crm, { type: "complete", note: "Cliente não seguirá com o gesso" });
  assert.equal(crm.opportunities[0].stage, "won");
  assert.deepEqual(crm.opportunities[0].discardedProducts, ["GESSO"]);
  assert.equal(crm.sales.length, 1);
  crm = act(crm, {
    type: "reopen",
    note: "Novo ambiente na obra",
    products: ["FORRO"],
  });
  crm = act(crm, {
    type: "sale",
    products: ["FORRO"],
    value: 200,
    date: today(),
    sellerTeamId: "charles",
  });
  assert.equal(crm.sales.length, 2);
  assert.deepEqual(
    crm.sales.map((sale) => sale.cycle),
    [1, 2],
  );
});

test("visita resolve retorno vencido sem apagar o histórico e relacionamento legado é vinculado à obra conhecida", () => {
  let data = seed();
  data.crm = act(data.crm, {
    type: "update",
    stage: "waiting",
    responsibleId: "charles",
    nextAction: "Retornar à obra",
    nextDate: today(),
  });
  data = reconcileLocalCrm(
    recordVisit(
      data,
      draft({
        workId: data.works[0].id,
        stage: "relationship",
        crmEnabled: undefined,
        offered: [],
      }),
    ),
    actor("charles"),
  );
  assert.equal(data.crm.visitLinks.length, 2);
  assert.equal(data.crm.opportunities[0].nextDate, "");
  assert.ok(
    data.crm.activities.some((event) => event.nextAction === "Retornar à obra"),
  );
});

test("venda em obra conhecida não pode contornar o fechamento já existente ao desmarcar o CRM", () => {
  let data = seed();
  data.crm = act(data.crm, {
    type: "sale",
    products: ["FORRO", "GESSO"],
    value: 100,
    date: today(),
    sellerTeamId: "charles",
  });
  assert.throws(
    () =>
      reconcileLocalCrm(
        recordVisit(
          data,
          draft({ crmEnabled: false, sold: ["FORRO"], saleValue: 100 }),
        ),
        actor("charles"),
      ),
    /já teve a negociação encerrada/,
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  PRODUCTS,
  TEAM,
  csvCell,
  emptyData,
  filterVisits,
  newVisit,
  recordVisit,
  summarize,
  today,
  validateVisit,
  productNames,
  catalogProducts,
  saveProduct,
  deleteContact,
  visitsCsv,
} from "../src/lib/domain.mjs";

const draft = (extra) => ({
  ...newVisit("claudionor"),
  workName: "Obra de teste",
  responsible: "Responsável teste",
  phone: "(11) 99999-1234",
  street: "Rua de teste",
  neighborhood: "Centro",
  city: "São Paulo",
  state: "SP",
  offered: ["FORRO", "GESSO"],
  ...extra,
});
const ids = { workId: "work-1", visitId: "visit-1", planId: "plan-1" };

test("editar/excluir produtos iniciais ou adicionais não muda vendas históricas", () => {
  let data = recordVisit(
    emptyData(),
    draft({ sold: ["FORRO"], saleValue: 100 }),
    ids,
  );
  const original = catalogProducts(data).find((item) => item.name === "FORRO");
  data = saveProduct(data, { ...original, name: "FORRO NOVO" });
  assert.ok(!productNames(data).includes("FORRO"));
  assert.ok(productNames(data).includes("FORRO NOVO"));
  assert.deepEqual(data.visits[0].sold, ["FORRO"]);
  assert.throws(
    () => saveProduct(data, { ...original, name: " gesso " }),
    /Já existe/,
  );
  data = saveProduct(data, {
    ...catalogProducts(data).find((item) => item.id === original.id),
    deleted: true,
  });
  assert.equal(productNames(data).length, 13);
  assert.equal(
    summarize(data.visits, productNames(data)).products.find(
      (item) => item.name === "FORRO",
    ).sold,
    1,
  );
  assert.throws(
    () => recordVisit(data, draft(), { ...ids, visitId: "new" }),
    /Produto inválido/,
  );
  assert.throws(() => saveProduct(data, original), /excluído/);
  const added = { id: crypto.randomUUID(), name: "ACABAMENTO" };
  data = saveProduct(data, added);
  data = saveProduct(data, { ...added, name: "ACABAMENTO NOVO" });
  data = saveProduct(data, {
    ...added,
    name: "ACABAMENTO NOVO",
    deleted: true,
  });
  assert.equal(productNames(data).length, 13);
});

test("excluir contato mantém vínculos, snapshots e filtros históricos", () => {
  let data = emptyData();
  const architect = {
    id: crypto.randomUUID(),
    name: "Arquiteto teste",
    role: "architect",
  };
  data.contacts.push(architect);
  data = recordVisit(data, draft({ architectId: architect.id }), ids);
  data = deleteContact(data, architect.id);
  assert.ok(data.contacts[0].deleted);
  assert.equal(data.works[0].architectId, architect.id);
  assert.equal(data.visits[0].architectName, architect.name);
  assert.equal(
    filterVisits(data.visits, { architectId: architect.id }).length,
    1,
  );
  assert.throws(
    () => recordVisit(data, draft({ architectId: architect.id })),
    /contato foi excluído/,
  );
  assert.doesNotThrow(() =>
    recordVisit(data, draft({ workId: "work-1", architectId: architect.id })),
  );
});

test("base vazia contém apenas a configuração dos produtos e colaboradores solicitados", () => {
  const data = emptyData();
  assert.deepEqual(data, {
    version: 1,
    products: [],
    works: [],
    contacts: [],
    visits: [],
    plans: [],
  });
  assert.equal(PRODUCTS.length, 14);
  assert.equal(new Set(PRODUCTS).size, 14);
  assert.deepEqual(
    TEAM.map((user) => user.name),
    ["Claudionor", "Charles", "Celso", "Recepção"],
  );
});

test("produto cadastrado entra na visita e nos indicadores sem alterar o catálogo inicial", () => {
  const data = {
    ...emptyData(),
    products: [{ id: "produto-teste", name: "ACABAMENTO TESTE" }],
  };
  assert.equal(productNames(data).length, 15);
  const custom = draft({
    offered: ["ACABAMENTO TESTE"],
    sold: ["ACABAMENTO TESTE"],
    stage: "closing",
    saleValue: "300",
  });
  assert.throws(() => validateVisit(custom), /Produto inválido/);
  const saved = recordVisit(data, custom, ids);
  const stats = summarize(saved.visits, productNames(saved));
  assert.equal(
    stats.products.find((item) => item.name === "ACABAMENTO TESTE").sold,
    1,
  );
  assert.equal(PRODUCTS.length, 14);
});
test("bairro obrigatório, telefone com DDD, datas e coerência de produtos", () => {
  assert.doesNotThrow(() =>
    validateVisit(draft({ responsible: "", phone: "" })),
  );
  assert.throws(() => validateVisit(draft({ neighborhood: "  " })), /bairro/);
  assert.throws(() => validateVisit(draft({ phone: "123" })), /telefone/);
  assert.throws(() => validateVisit(draft({ sold: ["PORTA"] })), /oferecidos/);
  assert.throws(
    () => validateVisit(draft({ saleValue: "500", sold: [] })),
    /produto vendido/,
  );
  assert.throws(() => validateVisit(draft({ date: "2099-01-01" })), /data/);
  assert.throws(() => validateVisit(draft({ stage: "closing" })), /fechamento/);
  assert.throws(() => validateVisit(draft({ saleValue: "-1" })), /valor/);
  assert.throws(
    () => validateVisit(draft({ scheduleNext: true, nextDate: "2000-01-01" })),
    /próxima visita/,
  );
});
test("relacionamento pode ser salvo sem produtos e permanece nos relatórios", () => {
  const relationship = draft({
    stage: "relationship",
    offered: [],
    sold: [],
    notes: "Acompanhar andamento da obra",
  });
  assert.doesNotThrow(() => validateVisit(relationship));
  assert.throws(
    () => validateVisit({ ...relationship, stage: "prospecting" }),
    /produto oferecido/,
  );
  assert.throws(
    () => validateVisit({ ...relationship, stage: "closing" }),
    /produto oferecido/,
  );
  assert.throws(
    () => validateVisit({ ...relationship, saleValue: "500" }),
    /produto vendido/,
  );
  const data = recordVisit(emptyData(), relationship, ids);
  assert.equal(data.visits[0].stage, "relationship");
  assert.deepEqual(data.visits[0].offered, []);
  assert.deepEqual(data.visits[0].sold, []);
  assert.equal(data.visits[0].saleValue, 0);
  const filtered = filterVisits(data.visits, { stage: "relationship" });
  assert.equal(filtered.length, 1);
  assert.equal(summarize(filtered).visits, 1);
  assert.equal(
    summarize(filtered).products.some((item) => item.offered),
    false,
  );
});
test("uma visita cria obra e retorno na mesma alteração sem modificar o estado anterior", () => {
  const before = emptyData();
  const next = recordVisit(
    before,
    draft({
      sold: ["FORRO"],
      saleValue: "1000",
      scheduleNext: true,
      nextDate: today(),
    }),
    ids,
  );
  assert.equal(before.visits.length, 0);
  assert.equal(before.works.length, 0);
  assert.equal(next.works.length, 1);
  assert.equal(next.visits[0].workId, "work-1");
  assert.equal(next.visits[0].stage, "closing");
  assert.equal(next.visits[0].saleValue, 1000);
  assert.equal(next.plans[0].workId, "work-1");
  assert.equal(next.plans[0].status, "planned");
});
test("visitar a obra existente conclui sua programação e não duplica a obra", () => {
  const initial = recordVisit(
    emptyData(),
    draft({ scheduleNext: true, nextDate: today() }),
    ids,
  );
  const next = recordVisit(
    initial,
    draft({
      workId: "work-1",
      planId: "plan-1",
      scheduleNext: true,
      nextDate: today(),
    }),
    { ...ids, visitId: "visit-2", planId: "plan-2" },
  );
  assert.equal(next.works.length, 1);
  assert.equal(next.visits.length, 2);
  assert.equal(next.plans[0].status, "completed");
  assert.equal(next.plans[1].status, "planned");
  const repeat = recordVisit(
    initial,
    draft({ workId: "work-1", scheduleNext: true, nextDate: today() }),
    { ...ids, visitId: "visit-3", planId: "plan-3" },
  );
  assert.equal(repeat.plans.length, 1);
});
test("relatórios combinam contatos, período, colaborador, bairro, produto e resultado", () => {
  const visit = recordVisit(
    emptyData(),
    draft({
      sold: ["FORRO"],
      contractorId: "contractor",
      architectId: "architect",
    }),
    ids,
  ).visits[0];
  const filters = {
    start: today(),
    end: today(),
    userId: "claudionor",
    contractorId: "contractor",
    architectId: "architect",
    neighborhood: "CENTRO",
    type: "Residencial",
    product: "FORRO",
    outcome: "sold",
  };
  assert.equal(filterVisits([visit], filters).length, 1);
  assert.equal(
    filterVisits([visit], { ...filters, architectId: "other" }).length,
    0,
  );
  assert.equal(
    filterVisits([visit], { ...filters, product: "GESSO" }).length,
    0,
  );
  assert.equal(
    filterVisits([visit], { ...filters, product: "FORRO", outcome: "interest" })
      .length,
    0,
  );
  assert.equal(
    filterVisits([visit], { ...filters, product: "GESSO", outcome: "interest" })
      .length,
    1,
  );
  assert.equal(
    filterVisits([visit], { ...filters, start: "2099-01-01" }).length,
    0,
  );
});
test("interesse por produto não conta como venda e bairros homônimos de cidades distintas não se misturam", () => {
  const one = recordVisit(
    emptyData(),
    draft({ sold: ["FORRO"], saleValue: "750" }),
    ids,
  ).visits[0];
  const two = {
    ...one,
    id: "visit-2",
    city: "Campinas",
    sold: [],
    saleValue: 0,
    stage: "prospecting",
  };
  const stats = summarize([one, two]);
  assert.equal(stats.sales, 1);
  assert.equal(stats.value, 750);
  assert.equal(stats.conversion, 50);
  assert.equal(stats.prospecting, 1);
  assert.equal(stats.neighborhoods.length, 2);
  assert.deepEqual(
    stats.products.find((item) => item.name === "FORRO"),
    { name: "FORRO", offered: 2, sold: 1, interest: 1 },
  );
  assert.equal(summarize([]).conversion, 0);
});
test("CSV inclui contatos, bairros e distinção de produtos e neutraliza fórmulas", () => {
  const visit = recordVisit(
    emptyData(),
    draft({ workName: '=HYPERLINK("bad")', sold: ["FORRO"] }),
    ids,
  ).visits[0];
  const csv = visitsCsv([visit]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("Empreiteiro"));
  assert.ok(csv.includes("Bairro"));
  assert.ok(csv.includes("Interesse sem venda"));
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.equal(csvCell("+123"), '"\'+123"');
  assert.equal(csvCell('normal;"value"'), '"normal;""value"""');
});

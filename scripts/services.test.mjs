import assert from "node:assert/strict";
import test from "node:test";
import { emptyData, newVisit, recordVisit, today } from "../src/lib/domain.mjs";
import { businessSales, reconcileLocalCrm } from "../src/lib/crm.mjs";
import { appointmentsOverlap, changeServiceStatus, decideInstallation, deleteInstaller, formatServiceDate, parseServiceDate, newAppointment, newService, saleServiceDraft, saveInstaller, saveService, serviceWeek } from "../src/lib/services.mjs";

const draft = (extra = {}) => ({ ...newService(), name: "Obra de teste", address: "Rua A, 10", neighborhood: "Centro", city: "Sorriso", description: "Instalar forro", products: ["FORRO"], ...extra });
const staffed = () => saveInstaller(emptyData(), { name: "Instalador A" });
const slot = (data, extra = {}) => ({ ...newAppointment(today()), installerIds: [data.installers[0].id], ...extra });

test("datas de Serviços usam dia/mês/ano e o endereço mantém CEP, número e UF", () => {
  assert.equal(formatServiceDate("2026-11-23"), "23/11/2026");
  assert.equal(parseServiceDate("23/11/2026"), "2026-11-23");
  for (const value of ["11/23/2026", "31/02/2026", "29/02/2026", "01/13/2026", ""]) assert.equal(parseServiceDate(value), "");
  assert.equal(parseServiceDate("29/02/2028"), "2028-02-29");
  const next = saveService(emptyData(), draft({ cep: "78550-000", street: "Rua do CEP", addressNumber: "42", complement: "Bloco A", state: "MT" }), "Recepção");
  assert.equal(next.services[0].cep, "78550-000");
  assert.equal(next.services[0].state, "MT");
  assert.equal(next.services[0].address, "Rua do CEP, 42, Bloco A");
  assert.equal(next.services[0].number, 1);
  assert.equal(next.services[0].addressNumber, "42");
  assert.throws(() => saveService(emptyData(), draft({ cep: "123" }), "Recepção"), /CEP/);
  const legacy = draft();
  for (const field of ["cep", "street", "number", "complement", "state"]) delete legacy[field];
  assert.equal(saveService(emptyData(), legacy, "Recepção").services[0].address, legacy.address);
});

test("serviço vinculado mantém venda única, produtos do fechamento e estado anterior", () => {
  const data = reconcileLocalCrm(recordVisit(emptyData(), { ...newVisit("claudionor"), workName: "Obra", street: "Rua A", neighborhood: "Centro", city: "Sorriso", state: "MT", offered: ["FORRO"], sold: ["FORRO"], saleValue: "500", stage: "closing" }));
  const original = structuredClone(data), sale = businessSales(data)[0];
  const next = saveService(data, saleServiceDraft(sale), "Recepção");
  assert.equal(next.services[0].status, "waiting");
  assert.equal(next.services[0].saleId, sale.id);
  assert.equal(next.serviceDecisions[sale.id], "required");
  assert.deepEqual(businessSales(next), businessSales(data));
  assert.deepEqual(data, original);
  assert.throws(() => saveService(data, { ...saleServiceDraft(sale), products: ["GESSO"] }, "Recepção"), /fechamento/);
  assert.throws(() => decideInstallation(next, sale.id, "not_required"), /serviço ativo/);
});

test("agenda detecta sobreposição por equipe e permite períodos sem conflito", () => {
  let data = staffed();
  data = saveService(data, draft({ appointments: [slot(data)] }), "Recepção");
  assert.equal(data.services[0].status, "scheduled");
  assert.throws(() => saveService(data, draft({ appointments: [slot(data)] }), "Recepção"), /já possui agendamento/);
  assert.doesNotThrow(() => saveService(data, draft({ appointments: [slot(data, { period: "afternoon" })] }), "Recepção"));
  assert.throws(() => saveService(data, draft({ appointments: [slot(data, { period: "full" })] }), "Recepção"), /já possui/);
  assert.throws(() => saveService(staffed(), draft({ appointments: [{ ...newAppointment(today()), installerIds: [] }] }), "Recepção"), /ao menos um profissional/);
  assert.equal(appointmentsOverlap({ date: "2026-11-01", endDate: "2026-11-03", period: "morning" }, { date: "2026-11-03", period: "morning" }), true);
  assert.equal(appointmentsOverlap({ date: today(), period: "custom", startTime: "08:00", endTime: "09:00" }, { date: today(), period: "custom", startTime: "09:00", endTime: "10:00" }), false);
});

test("retorno e reagendamento conservam autoria, períodos anteriores e histórico", () => {
  let data = staffed();
  data = saveService(data, draft({ appointments: [slot(data)] }), "Recepção");
  const id = data.services[0].id;
  data = changeServiceStatus(data, id, "in_progress", "", "Instalador");
  assert.throws(() => changeServiceStatus(data, id, "return_required", "", "Instalador"), /motivo/);
  data = changeServiceStatus(data, id, "return_required", "Faltou uma peça", "Instalador");
  assert.equal(data.services[0].appointments[0].state, "completed");
  const form = { ...data.services[0], appointments: [...data.services[0].appointments, slot(data, { period: "afternoon" })] };
  data = saveService(data, form, "Recepção");
  assert.equal(data.services[0].status, "scheduled");
  assert.equal(data.services[0].appointments.length, 2);
  assert.match(JSON.stringify(data.services[0].history), /Faltou uma peça/);
  data = changeServiceStatus(data, id, "completed", "Finalizado", "Instalador");
  assert.ok(data.services[0].appointments.every((item) => item.state === "completed"));
  assert.equal(saveService(data, { ...data.services[0], notes: "Foto e orientações revisadas" }, "Recepção").services[0].status, "completed");
  assert.throws(() => saveService(data, { ...data.services[0], appointments: [...data.services[0].appointments, slot(data)] }, "Recepção"), /Reabra/);
  data = changeServiceStatus(data, id, "return_required", "Ajuste solicitado", "Recepção");
  assert.equal(data.services[0].history[0].actor, "Recepção");
});

test("datas inválidas e horários invertidos são recusados; equipe não duplica nem some da agenda", () => {
  let data = staffed();
  assert.throws(() => saveInstaller(data, { name: " instalador a " }), /Já existe/);
  for (const date of ["2026-99-01", "2026-02-30", ""]) assert.throws(() => saveService(data, draft({ appointments: [slot(data, { date })] }), "Recepção"), /datas válidas/);
  assert.throws(() => saveService(data, draft({ appointments: [slot(data, { period: "custom", startTime: "11:00", endTime: "10:00" })] }), "Recepção"), /horário final/);
  data = saveService(data, draft({ appointments: [slot(data)] }), "Recepção");
  assert.throws(() => saveInstaller(data, { ...data.installers[0], inactive: true }), /Reatribua/);
  data = changeServiceStatus(data, data.services[0].id, "cancelled", "Cliente solicitou", "Recepção");
  assert.equal(data.services[0].appointments[0].state, "cancelled");
  assert.doesNotThrow(() => saveInstaller(data, { ...data.installers[0], inactive: true }));
  assert.deepEqual(serviceWeek("2026-11-01"), ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
});

test("excluir profissional preserva serviços antigos e impede edição ou novo agendamento", () => {
  let data = staffed();
  const id = data.installers[0].id;
  data = saveService(data, draft({ appointments: [slot(data)] }), "Administrador");
  assert.throws(() => deleteInstaller(data, id), /Reatribua.*excluí-lo/);
  data = changeServiceStatus(data, data.services[0].id, "completed", "Finalizado", "Administrador");
  const before = structuredClone(data), next = deleteInstaller(data, id);
  assert.deepEqual(data, before);
  assert.deepEqual(next.services, before.services);
  assert.equal(next.installers[0].deleted, true);
  assert.equal(next.installers[0].name, "Instalador A");
  assert.throws(() => saveInstaller(next, { id, name: "Reativado" }), /não encontrado/);
  assert.throws(() => saveService(next, draft({ appointments: [slot(next)] }), "Administrador"), /profissionais disponíveis/);
  assert.equal(saveInstaller(next, { name: "Instalador A" }).installers.filter((row) => !row.deleted).length, 1);
});

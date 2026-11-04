import test from "node:test";
import assert from "node:assert/strict";
import { emptyData, newVisit, recordVisit, today } from "../src/lib/domain.mjs";
import { businessSales, reconcileLocalCrm } from "../src/lib/crm.mjs";
import { newService, newAppointment, saveInstaller, saveService, decideInstallation, saleServiceDraft } from "../src/lib/services.mjs";
import { calendarDays, compareAppointments, installationQueue, serviceScheduleAction, shiftCalendar } from "../src/lib/service-operations.mjs";
import { applyServiceAction } from "../server/services-store.mjs";

const draft = (name, appointments = []) => ({ ...newService(), name, address: "Rua A", neighborhood: "Centro", city: "Sorriso", description: "Instalar forro", appointments });
function fixture() {
  let data = saveInstaller(saveInstaller(emptyData(), { name: "Equipe A" }), { name: "Equipe B" });
  const slot = { ...newAppointment("2026-11-09"), endDate: "2026-11-11", installerIds: data.installers.map((row) => row.id) };
  data = saveService(data, draft("Origem", [slot]), "ADM");
  data = saveService(data, draft("Destino"), "ADM");
  return { data, id: data.services[0].id, targetId: data.services[1].id, appointmentId: slot.id, day: "2026-11-10" };
}
test("fila inclui somente instalações e obras avulsas pendentes, sem recriar serviços excluídos", () => {
  let data = reconcileLocalCrm(recordVisit(emptyData(), { ...newVisit("claudionor"), workName: "Venda", street: "Rua A", neighborhood: "Centro", city: "Sorriso", state: "MT", stage: "closing", offered: ["FORRO"], sold: ["FORRO"], requiresInstallation: true, saleValue: "500" }));
  assert.equal(businessSales(data)[0].requiresInstallation, true);
  assert.equal(installationQueue(data).length, 1);
  const sale = businessSales(data)[0], financial = structuredClone(businessSales(data));
  assert.equal(installationQueue(decideInstallation(data, sale.id, "not_required")).length, 0);
  data = saveService(data, saleServiceDraft(sale), "ADM");
  assert.equal(installationQueue(data).length, 1);
  assert.throws(() => saveService(data, { ...saleServiceDraft(sale), queueSaleId: sale.id }, "Outro acesso"), /já foi distribuída/);
  data = serviceScheduleAction(data, { type: "deleteService", id: data.services[0].id, reason: "Duplicado" }, "ADM");
  assert.equal(installationQueue(data).length, 0);
  assert.deepEqual(businessSales(data), financial);
});
test("reagendamento de um dia mantém os outros dias e rejeita conflito da equipe", () => {
  const fixtureData = fixture(), { data, ...ids } = fixtureData;
  const before = structuredClone(data);
  const next = serviceScheduleAction(data, { ...ids, type: "moveAppointment", date: "2026-11-12", period: "afternoon" }, "Túlio");
  const slots = next.services[0].appointments.filter((row) => row.state === "planned");
  assert.deepEqual(slots.map((row) => [row.date, row.endDate, row.period]), [["2026-11-09", "2026-11-09", "morning"], ["2026-11-11", "2026-11-11", "morning"], ["2026-11-12", "2026-11-12", "afternoon"]]);
  assert.deepEqual(data, before);
  const changedCrew = serviceScheduleAction(data, { ...ids, type: "moveAppointment", date: "2026-11-12", period: "afternoon", installerIds: [data.installers[1].id] }, "Túlio");
  assert.deepEqual(changedCrew.services[0].appointments.find((row) => row.state === "planned" && row.date === "2026-11-12").installerIds, [data.installers[1].id]);
  const busy = saveService(data, { ...data.services[1], appointments: [{ ...newAppointment("2026-11-12"), period: "afternoon", installerIds: [data.installers[0].id] }] }, "ADM");
  assert.throws(() => serviceScheduleAction(busy, { ...ids, type: "moveAppointment", date: "2026-11-12", period: "afternoon" }, "ADM"), /já possui agendamento/);
});
test("transferência parcial de equipe é atômica, libera o dia e registra origem e destino", () => {
  const { data, ...ids } = fixture(), original = structuredClone(data);
  const moved = data.installers[0].id, remaining = data.installers[1].id;
  const next = serviceScheduleAction(data, { ...ids, type: "transferAppointment", date: ids.day, period: "morning", installerIds: [moved], reason: "Prioridade do cliente" }, "Túlio");
  const originalDay = next.services[0].appointments.filter((slot) => slot.state === "planned" && slot.date <= ids.day && slot.endDate >= ids.day);
  assert.deepEqual(originalDay[0].installerIds, [remaining]);
  assert.deepEqual(next.services[1].appointments[0].installerIds, [moved]);
  assert.match(next.services[0].history.at(-1).note, /Foi para outra obra/);
  assert.match(next.services[1].history.at(-1).note, /Origem/);
  assert.deepEqual(data, original);
});
test("exclusão permite apenas o dia ou o serviço inteiro, preserva histórico e exige acesso", () => {
  const { data, ...ids } = fixture();
  const request = { ...ids, type: "cancelAppointment", reason: "Cliente desmarcou" };
  const next = applyServiceAction(data, request, { role: "supervisor", teamId: "tulio", name: "Túlio" });
  assert.equal(next.services[0].appointments.filter((row) => row.state === "planned").length, 2);
  assert.equal(next.services[0].deleted, undefined);
  const deleted = serviceScheduleAction(data, { type: "deleteService", id: ids.id, reason: "Pedido encerrado" }, "ADM");
  assert.equal(deleted.services[0].deleted, true);
  assert.ok(deleted.services[0].appointments.every((row) => row.state !== "planned"));
  assert.throws(() => applyServiceAction(data, request, { role: "collaborator", teamId: "charles" }), { status: 403 });
  assert.throws(() => serviceScheduleAction(data, { ...request, reason: "" }, "ADM"), /motivo/);
});
test("calendário ordena manhã antes da tarde, mostra mês e mantém domingo acessível", () => {
  const events = [{ ...newAppointment(today()), period: "afternoon" }, { ...newAppointment(today()), period: "morning" }].sort(compareAppointments);
  assert.equal(events[0].period, "morning");
  assert.equal(calendarDays("2026-11-04", "week").length, 6);
  assert.equal(calendarDays("2026-11-04", "week", true).length, 7);
  assert.ok(calendarDays("2026-11-04", "month").includes("2026-11-30"));
  assert.equal(calendarDays("2026-11-01", "day")[0], "2026-11-01");
  assert.equal(shiftCalendar("2026-01-31", "month", 1), "2026-02-01");
});

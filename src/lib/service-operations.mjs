import { uid } from "./domain.mjs";
import { appointmentHours, newAppointment, saleServiceDraft, serviceSales, shiftServiceDate, validateAppointments } from "./services.mjs";

const ensure = (condition, message) => { if (!condition) throw new Error(message); };
export const serviceActive = (item) => !item.deleted && !["completed", "cancelled"].includes(item.status);
export function needsInstallation(data, sale) {
  const decision = data.serviceDecisions?.[sale.id];
  return decision ? decision === "required" : sale.requiresInstallation === true;
}
export function installationQueue(data) {
  const services = data.services || [];
  return [
    ...services.filter((item) => serviceActive(item) && !item.appointments.some((slot) => slot.state === "planned")).map((service) => ({ id: service.id, service, name: service.name, products: service.products })),
    ...serviceSales(data).filter((sale) => needsInstallation(data, sale) && !services.some((item) => item.saleId === sale.id))
      .map((sale) => ({ id: `sale:${sale.id}`, sale, name: sale.work.name, products: sale.products, draft: saleServiceDraft(sale) })),
  ];
}
export const compareAppointments = (a, b) => appointmentHours(a)[0] - appointmentHours(b)[0] || (a.order || 0) - (b.order || 0) || appointmentHours(a)[1] - appointmentHours(b)[1] || a.id.localeCompare(b.id);
export function calendarDays(date, period, showSunday = false) {
  ensure(/^\d{4}-\d{2}-\d{2}$/.test(date), "Informe uma data válida.");
  if (period === "day") return [date];
  const first = period === "month" ? `${date.slice(0, 7)}-01` : date;
  const weekday = new Date(`${first}T12:00:00Z`).getUTCDay();
  const monday = shiftServiceDate(first, -(weekday === 0 ? 6 : weekday - 1));
  let length = 7;
  if (period === "month") {
    const last = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
    last.setUTCMonth(last.getUTCMonth() + 1); last.setUTCDate(0);
    length = Math.ceil((Math.round((last - new Date(`${monday}T12:00:00Z`)) / 86400000) + 1) / 7) * 7;
  }
  return Array.from({ length }, (_, index) => shiftServiceDate(monday, index)).filter((day) => showSunday || new Date(`${day}T12:00:00Z`).getUTCDay() !== 0);
}
export function shiftCalendar(date, period, direction) {
  if (period !== "month") return shiftServiceDate(date, direction * (period === "week" ? 7 : 1));
  const result = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
  result.setUTCMonth(result.getUTCMonth() + direction); return result.toISOString().slice(0, 10);
}
function audit(type, actor, note, at) { return { id: uid(), type, actor, note, at }; }
function finishChange(service, appointments, actor, note, at) {
  const planned = appointments.some((row) => row.state === "planned");
  return { ...service, appointments, updatedAt: at,
    status: service.status === "completed" ? "completed" : planned ? service.status === "in_progress" ? "in_progress" : "scheduled" : service.status === "return_required" ? "return_required" : "waiting",
    history: [...service.history, audit("schedule", actor, note, at)],
  };
}
function partition(slot, day, scope, archivedState, movedCrew = slot.installerIds) {
  ensure(scope === "all" || day && slot.date <= day && (slot.endDate || slot.date) >= day, "Este compromisso não está marcado para o dia informado.");
  const start = scope === "all" ? slot.date : day, end = scope === "all" ? slot.endDate || slot.date : day;
  const pieces = [{ ...slot, state: "superseded" }];
  if (slot.date < start) pieces.push({ ...slot, id: uid(), endDate: shiftServiceDate(start, -1) });
  if ((slot.endDate || slot.date) > end) pieces.push({ ...slot, id: uid(), date: shiftServiceDate(end, 1) });
  const remainingCrew = slot.installerIds.filter((id) => !movedCrew.includes(id));
  if (remainingCrew.length) pieces.push({ ...slot, id: uid(), date: start, endDate: end, installerIds: remainingCrew });
  pieces.push({ ...slot, id: uid(), date: start, endDate: end, installerIds: movedCrew, state: archivedState });
  return { pieces, start, end };
}
export function serviceScheduleAction(data, action, actor, at = new Date().toISOString()) {
  const service = (data.services || []).find((row) => row.id === action.id && !row.deleted);
  ensure(service, "Serviço não encontrado.");
  if (action.type === "deleteService") {
    ensure(typeof action.reason === "string" && action.reason.trim() && action.reason.length <= 2000, "Informe o motivo da exclusão.");
    return { ...data, services: data.services.map((row) => row.id !== service.id ? row : {
      ...row, deleted: true, deletedAt: at, updatedAt: at,
      appointments: row.appointments.map((slot) => slot.state === "planned" ? { ...slot, state: "cancelled" } : slot),
      history: [...row.history, audit("deleted", actor, `Serviço excluído: ${action.reason.trim()}`, at)],
    }) };
  }
  const slot = service.appointments.find((row) => row.id === action.appointmentId && ["planned", "completed"].includes(row.state));
  ensure(slot, "O compromisso foi alterado. Atualize a agenda.");
  ensure(["moveAppointment", "cancelAppointment", "transferAppointment"].includes(action.type), "Ação de agenda inválida.");
  ensure(action.scope === undefined || ["day", "all"].includes(action.scope), "Escolha um período válido.");
  const cancelling = action.type === "cancelAppointment", transfer = action.type === "transferAppointment";
  ensure(cancelling || serviceActive(service) && slot.state === "planned", "Somente compromissos pendentes podem ser reagendados ou transferidos.");
  ensure(!cancelling && !transfer || typeof action.reason === "string" && action.reason.trim() && action.reason.length <= 2000, "Informe o motivo desta alteração.");
  const crew = transfer ? action.installerIds : slot.installerIds;
  ensure(Array.isArray(crew) && crew.length && new Set(crew).size === crew.length && crew.every((id) => slot.installerIds.includes(id)), "Selecione profissionais deste compromisso para transferir.");
  const part = partition(slot, action.day, action.scope || "day", transfer ? "transferred" : "cancelled", crew);
  let sourceAppointments = service.appointments.filter((row) => row.id !== slot.id).concat(part.pieces);
  const label = `${part.start}${part.start === part.end ? "" : ` a ${part.end}`}`;
  let changed = { ...data, services: data.services.map((row) => row.id === service.id ? { ...row, appointments: sourceAppointments } : row) };
  if (cancelling) {
    return { ...changed, services: changed.services.map((row) => row.id !== service.id ? row : finishChange(service, sourceAppointments, actor, `Compromisso retirado em ${label}: ${action.reason.trim()}`, at)) };
  }
  const destination = transfer ? changed.services.find((row) => row.id === action.targetId && serviceActive(row)) : service;
  ensure(destination && (!transfer || destination.id !== service.id), "Escolha outra obra ativa para receber a equipe.");
  if (transfer) {
    const transferredIds = new Set(part.pieces.filter((row) => row.state === "transferred").map((row) => row.id));
    sourceAppointments = sourceAppointments.map((row) => transferredIds.has(row.id) ? { ...row, destinationName: destination.name, destinationId: destination.id, transferReason: action.reason.trim() } : row);
    changed = { ...changed, services: changed.services.map((row) => row.id === service.id ? { ...row, appointments: sourceAppointments } : row) };
  }
  const moved = { ...newAppointment(action.date), endDate: action.scope === "all" ? shiftServiceDate(action.date, Math.round((new Date(`${part.end}T12:00:00Z`) - new Date(`${part.start}T12:00:00Z`)) / 86400000)) : action.date,
    period: action.period || slot.period, startTime: action.startTime || slot.startTime, endTime: action.endTime || slot.endTime, installerIds: [...(transfer ? crew : action.installerIds || crew)] };
  const appointments = transfer ? [...destination.appointments, moved] : [...sourceAppointments, moved];
  validateAppointments(changed, appointments.filter((row) => row.state === "planned"), destination.id);
  // Ordenação manual dentro do mesmo período, sem mudar os horários.
  const targetSlots = changed.services.filter((row) => serviceActive(row)).flatMap((row) => row.appointments)
    .filter((row) => row.state === "planned" && row.date <= moved.date && (row.endDate || row.date) >= moved.date && row.period === moved.period && row.id !== slot.id)
    .sort(compareAppointments);
  const before = targetSlots.findIndex((row) => row.id === action.beforeAppointmentId);
  const index = before < 0 ? targetSlots.length : before;
  targetSlots.splice(index, 0, moved);
  const ranks = new Map(targetSlots.map((row, position) => [row.id, position + 1]));
  const note = transfer ? `Foi para outra obra: ${destination.name}. ${label} → ${moved.date}. ${action.reason.trim()}` : `Compromisso reagendado: ${label} → ${moved.date} (${moved.period}).`;
  return { ...changed, services: changed.services.map((row) => {
    let result = row;
    if (row.id === service.id) result = finishChange(service, transfer ? sourceAppointments : appointments, actor, note, at);
    if (transfer && row.id === destination.id) result = finishChange(destination, appointments, actor, `Equipe recebida de ${service.name} em ${moved.date}: ${action.reason.trim()}`, at);
    return { ...result, appointments: result.appointments.map((item) => ranks.has(item.id) ? { ...item, order: ranks.get(item.id) } : item) };
  }) };
}

import React, { useState } from "react";
import { dateLabel } from "../lib/domain.mjs";
import { SERVICE_PERIODS } from "../lib/services.mjs";
import { serviceActive, serviceScheduleAction } from "../lib/service-operations.mjs";
import { Field, Modal, Select } from "./ui.jsx";
import ServiceDateField from "./ServiceDateField.jsx";

export default function ServiceOperationModal({ operation, data, save, actor, onClose }) {
  const service = data.services.find((row) => row.id === operation.id);
  const choices = service.appointments.filter((row) => ["planned", "completed"].includes(row.state));
  const [appointmentId, setAppointment] = useState(operation.appointmentId || choices.find((row) => row.state === "planned")?.id || choices[0]?.id || "");
  const slot = choices.find((row) => row.id === appointmentId);
  const [sourceDay, setSourceDay] = useState(operation.day || slot?.date || "");
  const [date, setDate] = useState(operation.day || slot?.date || ""), [period, setPeriod] = useState(slot?.period || "morning");
  const [startTime, setStart] = useState(slot?.startTime || "08:00"), [endTime, setEnd] = useState(slot?.endTime || "12:00");
  const [scope, setScope] = useState("day"), [deletion, setDeletion] = useState(slot ? "appointment" : "service");
  const [targetId, setTarget] = useState(""), [crew, setCrew] = useState(slot?.installerIds || []);
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const deleting = operation.type === "delete", transfer = operation.type === "transfer";
  const title = deleting ? "Excluir da agenda" : transfer ? "Foi para outra obra" : "Reagendar compromisso";
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    const action = { type: deleting ? deletion === "service" ? "deleteService" : "cancelAppointment" : transfer ? "transferAppointment" : "moveAppointment",
      id: service.id, appointmentId: slot?.id, day: sourceDay, scope, date, period, startTime, endTime, targetId, installerIds: crew, reason };
    try { await save((current) => serviceScheduleAction(current, action, actor), deleting ? "Exclusão registrada." : "Agenda atualizada.", action); onClose(); }
    catch (cause) { setError(cause.message); } finally { setBusy(false); }
  };
  return <Modal title={title} onClose={() => !busy && onClose()}><form onSubmit={submit} className="service-operation-form">
    <p><strong>{service.name}</strong>{slot && <> · {dateLabel(sourceDay)}</>}</p>
    {deleting && <fieldset className="service-delete-options"><legend>O que deseja excluir?</legend>
      {slot && <label><input type="radio" name="service-delete" checked={deletion === "appointment"} onChange={() => setDeletion("appointment")} />Somente este compromisso<small>A obra continua disponível para organizar os próximos serviços.</small></label>}
      <label><input type="radio" name="service-delete" checked={deletion === "service"} onChange={() => setDeletion("service")} />O serviço completo<small>Retira o serviço e os compromissos pendentes. A venda e o histórico são preservados.</small></label>
    </fieldset>}
    {deleting && deletion === "appointment" && !operation.appointmentId && <Select label="Compromisso a excluir" value={appointmentId} onChange={(id) => { setAppointment(id); setSourceDay(choices.find((row) => row.id === id).date); }} required>{choices.map((row) => <option value={row.id} key={row.id}>{dateLabel(row.date)}{row.endDate !== row.date ? ` a ${dateLabel(row.endDate)}` : ""} · {SERVICE_PERIODS[row.period]}</option>)}</Select>}
    {slot && (!deleting || deletion === "appointment") && slot.endDate && slot.endDate !== slot.date && <><Select label="Período afetado" value={scope} onChange={setScope}><option value="day">Somente um dia deste compromisso</option><option value="all">Todo o período deste compromisso</option></Select>{scope === "day" && <ServiceDateField label="Dia do compromisso original" value={sourceDay} min={slot.date} max={slot.endDate} onChange={setSourceDay} required />}</>}
    {!deleting && <>
      {transfer && <><Select label="Obra de destino" value={targetId} onChange={setTarget} required><option value="">Selecione outra obra</option>{data.services.filter((row) => row.id !== service.id && serviceActive(row)).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select>
        </>}
      <fieldset className="service-crew-options"><legend>{transfer ? "Profissionais transferidos" : "Equipe do compromisso"}</legend>{data.installers.filter((row) => transfer ? slot.installerIds.includes(row.id) : !row.deleted && (!row.inactive || slot.installerIds.includes(row.id))).map((row) => <label key={row.id}><input type="checkbox" checked={crew.includes(row.id)} onChange={(event) => setCrew(event.target.checked ? [...crew, row.id] : crew.filter((item) => item !== row.id))} />{row.name}</label>)}</fieldset>
      <ServiceDateField label="Nova data" value={date} required onChange={setDate} /><Select label="Novo período" value={period} onChange={setPeriod}>{Object.entries(SERVICE_PERIODS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select>
      {period === "custom" && <div className="fields two"><Field label="Horário inicial" type="time" value={startTime} onChange={(event) => setStart(event.target.value)} required /><Field label="Horário final" type="time" value={endTime} onChange={(event) => setEnd(event.target.value)} required /></div>}
      {transfer && <p className="inline-note">A equipe escolhida será liberada na origem e agendada na obra de destino. Os outros dias e profissionais permanecem na obra original.</p>}
    </>}
    <Field label={deleting || transfer ? "Motivo" : "Observação"}><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={2000} required={deleting || transfer} /></Field>
    {error && <p className="error" role="alert">{error}</p>}
    <footer className="modal-actions"><button className="button secondary" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? "Salvando…" : deleting ? "Confirmar exclusão" : "Salvar alteração"}</button></footer>
  </form></Modal>;
}

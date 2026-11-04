import React, { useRef, useState } from "react";
import { dateLabel, today } from "../lib/domain.mjs";
import { appointmentHours, SERVICE_PERIODS, serviceCode } from "../lib/services.mjs";
import { calendarDays, compareAppointments, shiftCalendar } from "../lib/service-operations.mjs";
import { Badge, Icon } from "./ui.jsx";
import ServiceDateField from "./ServiceDateField.jsx";

const crew = (slot, data) => slot.installerIds.map((id) => data.installers?.find((row) => row.id === id)?.name || "Profissional").join(", ");
const lane = (slot) => slot.period === "full" ? "full" : appointmentHours(slot)[0] < 720 ? "morning" : "afternoon";
export default function ServiceCalendar({ services, queue, data, onOpen, onQueue, onOperation, onMove }) {
  const [period, setPeriod] = useState("week"), [date, setDate] = useState(today()), [sunday, setSunday] = useState(false);
  const [dragging, setDragging] = useState(null), [hover, setHover] = useState("");
  const dragged = useRef(null);
  const days = calendarDays(date, period, sunday);
  const startDrag = (event, payload) => {
    dragged.current = payload; setDragging(payload); event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-famac-service", JSON.stringify(payload));
  };
  const endDrag = () => { dragged.current = null; setDragging(null); setHover(""); };
  const drop = (event, day, targetPeriod, beforeAppointmentId) => {
    event.preventDefault(); event.stopPropagation();
    const payload = dragged.current; endDrag();
    if (!payload) return;
    if (payload.queueId) {
      const item = queue.find((row) => row.id === payload.queueId);
      if (item && day) onQueue(item, day, targetPeriod);
    } else if (day) onMove({ type: "moveAppointment", id: payload.serviceId, appointmentId: payload.appointmentId, day: payload.day, date: day, period: targetPeriod, beforeAppointmentId });
    else onMove({ type: "cancelAppointment", id: payload.serviceId, appointmentId: payload.appointmentId, day: payload.day, reason: "Compromisso devolvido para Aguardando." });
  };
  const dragOver = (event, key) => {
    if (!dragged.current) return;
    event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "move"; setHover(key);
  };
  return <>
    <div className="services-calendar-controls">
      <div className="tabs" role="group" aria-label="Período da agenda de serviços">{[["day", "Dia"], ["week", "Semana"], ["month", "Mês"]].map(([id, label]) => <button key={id} aria-pressed={period === id} className={period === id ? "active" : ""} onClick={() => setPeriod(id)}>{label}</button>)}</div>
      <label className="service-sunday-toggle"><input type="checkbox" checked={sunday} onChange={(event) => setSunday(event.target.checked)} />Mostrar domingo</label>
      <div className="button-row"><button className="icon-button" aria-label="Período anterior da agenda" onClick={() => setDate(shiftCalendar(date, period, -1))}>‹</button><ServiceDateField label="Data da agenda" value={date} onChange={(next) => setDate(next || today())} /><button className="icon-button" aria-label="Próximo período da agenda" onClick={() => setDate(shiftCalendar(date, period, 1))}>›</button><button className="button secondary" onClick={() => setDate(today())}>Hoje</button></div>
    </div>
    {period === "month" && <h3 className="service-month-title">{new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h3>}
    <p className="service-calendar-hint"><Icon name="info" size={14} />Arraste para mudar o dia ou período. Pelo botão de reagendar, você também pode ajustar a equipe.</p>
    <div className={`service-planner ${period === "month" ? "month-planner" : ""} ${dragging ? "is-dragging" : ""}`}>
      <aside className={`service-waiting ${hover === "waiting" ? "is-drop-target" : ""}`} aria-label="Aguardando distribuição" onDragOver={(event) => dragOver(event, "waiting")} onDrop={(event) => drop(event)}>
        <header><span><Icon name="clock" size={16} />Aguardando</span><Badge>{queue.length}</Badge><small>Escolha a obra e distribua a equipe.</small></header>
        <div className="service-waiting-items">{queue.map((item) => <article key={item.id} draggable onDragStart={(event) => startDrag(event, { queueId: item.id })} onDragEnd={endDrag} className="service-waiting-card">
          <small>{item.sale ? `Venda de ${dateLabel(item.sale.date)}` : serviceCode(item.service.number)}</small><strong>{item.name}</strong><span>{item.products.join(", ") || item.service?.description}</span>
          <button className="button secondary" onClick={() => onQueue(item)}>Distribuir equipe<Icon name="arrow" size={14} /></button>
        </article>)}{!queue.length && <p className="services-day-empty">Tudo distribuído por aqui.</p>}</div>
      </aside>
      <div className="services-calendar-scroll"><div className={`services-calendar planner-calendar ${period === "day" ? "single-day" : period === "month" ? "month-calendar" : ""}`} style={{ "--calendar-columns": period === "day" ? 1 : sunday ? 7 : 6 }}>
        {days.map((day) => {
          const events = services.flatMap((service) => service.appointments.filter((slot) => ["planned", "completed", "transferred"].includes(slot.state) && slot.date <= day && (slot.endDate || slot.date) >= day).map((appointment) => ({ service, appointment }))).sort((a, b) => compareAppointments(a.appointment, b.appointment));
          return <section className={`services-day ${day === today() ? "is-today" : ""} ${period === "month" && day.slice(0, 7) !== date.slice(0, 7) ? "outside-month" : ""}`} key={day} aria-label={`Serviços em ${dateLabel(day)}`}>
            <header><span>{new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short" })}</span><strong>{dateLabel(day).slice(0, 5)}</strong><small>{events.filter(({ appointment }) => appointment.state !== "transferred").length} agendamentos</small></header>
            {["full", "morning", "afternoon"].map((part) => {
              const slots = events.filter(({ appointment }) => lane(appointment) === part), key = `${day}:${part}`;
              return <div key={part} className={`service-period-lane ${hover === key ? "is-drop-target" : ""}`} aria-label={`${dateLabel(day)} · ${SERVICE_PERIODS[part]}`} data-day={day} data-period={part} onDragOver={(event) => dragOver(event, key)} onDrop={(event) => drop(event, day, part)}>
                <h4>{part === "morning" ? "Manhã" : part === "afternoon" ? "Tarde" : "Dia inteiro"}</h4>
                {slots.map(({ service, appointment }) => <article draggable={appointment.state === "planned"} onDragStart={(event) => startDrag(event, { serviceId: service.id, appointmentId: appointment.id, day })} onDragEnd={endDrag} onDragOver={(event) => dragOver(event, key)} onDrop={(event) => drop(event, day, part, appointment.id)} className={`service-calendar-card service-state-${service.status} ${appointment.state === "transferred" ? "service-transfer-marker" : ""}`} key={appointment.id}>
                  <button className="service-calendar-open" onClick={() => onOpen(service.id)} aria-label={`Abrir serviço ${service.name}`}>
                    <span className="service-event-time"><Icon name="clock" size={13} />{appointment.period === "custom" ? `${appointment.startTime}–${appointment.endTime}` : SERVICE_PERIODS[appointment.period]}</span><small>{serviceCode(service.number)} · {service.type}</small><strong>{service.name}</strong><span>{service.description}</span><span className="service-event-crew"><Icon name="users" size={14} />{crew(appointment, data)}</span>
                    {appointment.state === "transferred" && <span>Destino: {appointment.destinationName}</span>}
                    <Badge tone={appointment.state === "completed" ? "success" : appointment.state === "transferred" ? "" : "blue"}>{appointment.state === "transferred" ? "Foi para outra obra" : appointment.state === "completed" ? "Etapa realizada" : service.status === "in_progress" ? "Em execução" : "Agendado"}</Badge>
                  </button>
                  {appointment.state !== "transferred" && <div className="service-card-actions">
                    {appointment.state === "planned" && <><button className="icon-button" aria-label={`Reagendar ${service.name} em ${dateLabel(day)}`} title="Reagendar" onClick={() => onOperation({ type: "move", id: service.id, appointmentId: appointment.id, day })}><Icon name="calendar" size={15} /></button><button className="icon-button" aria-label={`Transferir equipe de ${service.name} em ${dateLabel(day)}`} title="Foi para outra obra" onClick={() => onOperation({ type: "transfer", id: service.id, appointmentId: appointment.id, day })}><Icon name="arrow" size={15} /></button></>}
                    <button className="icon-button" aria-label={`Excluir compromisso de ${service.name} em ${dateLabel(day)}`} title="Excluir" onClick={() => onOperation({ type: "delete", id: service.id, appointmentId: appointment.id, day })}><Icon name="trash" size={15} /></button>
                  </div>}
                </article>)}
                {!slots.length && <span className="service-lane-empty">{dragging ? "Solte para agendar" : part === "full" ? "Sem agendamento de dia inteiro" : part === "morning" ? "Sem agendamentos pela manhã" : "Sem agendamentos à tarde"}</span>}
              </div>;
            })}
          </section>;
        })}
      </div></div>
    </div>
  </>;
}

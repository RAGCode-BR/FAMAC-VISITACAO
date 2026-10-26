import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./ui.jsx";
import "../notifications.css";

export default function NotificationBell({ notifications, onRead, onOpen }) {
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const root = useRef(null);
  const unread = notifications.filter((item) => !item.readAt).length;
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    const closeEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);
  const act = async (item, navigate) => {
    if (busyId) return;
    setBusyId(item.id);
    setError("");
    try {
      if (!item.readAt) await onRead(item.id);
      if (navigate) {
        setOpen(false);
        onOpen(item.opportunityId);
      }
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusyId("");
    }
  };
  return <div className="notification-root" ref={root}>
    <button className="notification-trigger" type="button"
      aria-label={`Notificações${unread ? `, ${unread} pendentes` : ", nenhuma pendente"}`}
      aria-expanded={open} aria-controls="notification-panel"
      onClick={() => { setOpen(!open); setError(""); }}>
      <Icon name="bell" size={20} />
      {unread > 0 && <span className="notification-count">{unread > 99 ? "99+" : unread}</span>}
    </button>
    {open && <section id="notification-panel" className="notification-panel" aria-label="Suas notificações">
      <div className="notification-heading">
        <div><strong>Notificações</strong><span>{unread ? `${unread} pendente${unread === 1 ? "" : "s"}` : "Tudo em dia"}</span></div>
        <button type="button" className="icon-button" aria-label="Fechar notificações" onClick={() => setOpen(false)}><Icon name="close" size={17} /></button>
      </div>
      {error && <p className="error notification-error" role="alert">{error}</p>}
      <div className="notification-list">
        {notifications.length ? notifications.map((item) =>
          <article key={item.id} className={`notification-item ${item.readAt ? "" : "unread"}`}>
            <span className="notification-item-icon"><Icon name="building" size={18} /></span>
            <div>
              <strong>{item.workName}</strong>
              <p>{item.actorName} atribuiu você como vendedor responsável.</p>
              <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
              <div className="notification-actions">
                <button type="button" disabled={!!busyId} onClick={() => act(item, true)}>Abrir no CRM</button>
                {!item.readAt && <button type="button" disabled={!!busyId} onClick={() => act(item, false)}>Marcar como lida</button>}
              </div>
            </div>
          </article>) : <p className="notification-empty">Quando uma obra for atribuída a você, o aviso aparecerá aqui.</p>}
      </div>
    </section>}
  </div>;
}

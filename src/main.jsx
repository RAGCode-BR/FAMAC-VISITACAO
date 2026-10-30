import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { TEAM, emptyData, today } from "./lib/domain.mjs";
import { repository } from "./lib/repository.mjs";
import { isSharedContact } from "./lib/contacts.mjs";
import { Badge, Icon, Modal } from "./components/ui.jsx";
import VisitForm from "./components/VisitForm.jsx";
import AuthGate, { PasswordForm } from "./components/AuthGate.jsx";
import Crm from "./components/Crm.jsx";
import NotificationBell from "./components/NotificationBell.jsx";
import {
  Catalog,
  Contacts,
  Dashboard,
  Reports,
  Schedule,
  Team,
  VisitDetail,
  VisitsTable,
  Works,
} from "./components/pages.jsx";
import "./styles.css";
import "./readability.css";
import "./auth.css";

const NAV = [
  ["overview", "grid", "Visão geral"],
  ["new", "plus", "Nova visita"],
  ["visits", "visit", "Visitas realizadas"],
  ["crm", "kanban", "CRM"],
  ["schedule", "calendar", "Programação"],
  ["works", "building", "Obras"],
  ["contacts", "users", "Contatos"],
  ["reports", "chart", "Relatórios"],
  ["catalog", "box", "Produtos"],
  ["team", "users", "Colaboradores"],
];
const PAGE = {
  crm: [
    "CRM DE OPORTUNIDADES",
    "Uma equipe. Oportunidades em movimento.",
    "Da primeira visita ao fechamento, cada próximo passo tem seu lugar.",
  ],
  new: [
    "NOVA VISITA",
    "Cada visita, uma oportunidade.",
    "Um registro simples para construir grandes conexões.",
  ],
  overview: [
    "VISÃO GERAL",
    "Seu próximo resultado começa aqui.",
    "Uma visão completa das suas conexões e oportunidades.",
  ],
  visits: [
    "VISITAS REALIZADAS",
    "Cada conexão tem uma história.",
    "Consulte os registros e acompanhe os próximos passos.",
  ],
  schedule: [
    "PROGRAMAÇÃO",
    "O próximo encontro está no radar.",
    "Planeje seus retornos, no ritmo da sua rotina.",
  ],
  works: [
    "OBRAS",
    "Onde as possibilidades ganham forma.",
    "Endereços, pessoas e oportunidades em um só lugar.",
  ],
  contacts: [
    "CONTATOS",
    "Pessoas que constroem com você.",
    "Sua rede de arquitetos, empreiteiros e responsáveis.",
  ],
  reports: [
    "RELATÓRIOS",
    "Uma visão além da visita.",
    "Transforme seus registros em decisões mais claras.",
  ],
  catalog: [
    "PRODUTOS",
    "Do primeiro detalhe ao acabamento.",
    "Um portfólio de soluções para transformar ambientes.",
  ],
  team: [
    "COLABORADORES",
    "Uma equipe. Muitas possibilidades.",
    "As pessoas por trás de cada nova oportunidade.",
  ],
};

class AppBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="startup">
        <h1>Não foi possível abrir esta tela.</h1>
        <p>
          Recarregue a página para tentar novamente. Os registros já salvos
          serão carregados novamente.
        </p>
        <button className="button primary" onClick={() => location.reload()}>
          Recarregar
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}

function App({ account, onLogout }) {
  const canAssign = !account || account.role === "admin";
  const canManageSeller = !account || ["admin", "supervisor"].includes(account.role);
  const canManageCatalog = canManageSeller;
  const [data, setData] = useState(emptyData);
  const dataRef = useRef(data);
  const saving = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState("new");
  const [crmFocus, setCrmFocus] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [userId, setUserId] = useState(account?.teamId || "claudionor");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [detail, setDetail] = useState(null);
  const [deletingVisit, setDeletingVisit] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [activePlan, setActivePlan] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [pendingPlan, setPendingPlan] = useState(null);
  const navRef = useRef(null);
  const menuRef = useRef(null);
  useEffect(() => {
    repository.setActor(userId);
  }, [userId]);
  useEffect(() => {
    let active = true;
    repository
      .load()
      .then((next) => {
        if (active) {
          dataRef.current = next;
          setData(next);
          setLoading(false);
        }
      })
      .catch((error) => {
        if (active) {
          setLoadError(error.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!account || loading || loadError) return;
    let active = true;
    let pending;
    let lastAttempt = 0;
    const sync = async () => {
      if (
        document.visibilityState !== "visible" ||
        !navigator.onLine ||
        saving.current ||
        pending ||
        document.querySelector("dialog[open]") ||
        Date.now() - lastAttempt < 3000
      )
        return;
      lastAttempt = Date.now();
      const before = dataRef.current;
      pending = new AbortController();
      try {
        const latest = await repository.sync(before.revision, pending.signal);
        // Uma resposta anterior ao salvamento não pode sobrescrever o resultado.
        if (
          active &&
          latest &&
          !saving.current &&
          !document.querySelector("dialog[open]") &&
          dataRef.current === before
        ) {
          dataRef.current = latest;
          setData(latest);
        }
      } catch {
        // A próxima consulta tenta novamente; o formulário permanece intacto.
      } finally {
        pending = null;
      }
    };
    const interval = setInterval(sync, 30000);
    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      active = false;
      clearInterval(interval);
      pending?.abort();
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [account, loading, loadError]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  useEffect(() => {
    if (!navOpen) return;
    const previous = document.activeElement;
    navRef.current?.querySelector("button")?.focus();
    const key = (event) => {
      if (event.key === "Escape") {
        setNavOpen(false);
        menuRef.current?.focus();
      }
      if (event.key === "Tab") {
        const buttons = [...navRef.current.querySelectorAll("button")];
        const first = buttons[0];
        const last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [navOpen]);
  const persist = useCallback(async (operation, message) => {
    if (saving.current)
      throw new Error("Aguarde o registro anterior terminar de salvar.");
    saving.current = true;
    try {
      const persisted = await operation(dataRef.current);
      dataRef.current = persisted;
      setData(persisted);
      setNotice(message);
      return persisted;
    } catch (error) {
      if (error.status === 409) {
        const latest = await repository.load();
        dataRef.current = latest;
        setData(latest);
      }
      throw error;
    } finally {
      saving.current = false;
    }
  }, []);
  const save = useCallback(
    (updater, message) =>
      persist((current) => repository.save(updater(current)), message),
    [persist],
  );
  const crmAction = useCallback(
    (id, action) =>
      persist(
        () => repository.crmAction(id, action),
        "Oportunidade atualizada.",
      ),
    [persist],
  );
  const deleteRecord = useCallback((kind, id) =>
    persist(() => repository.deleteRecord(kind, id), kind === "works" ? "Obra excluída." : "Programação excluída."), [persist]);
  const createCrmOpportunity = useCallback((workId, stage) =>
    persist(() => repository.createCrmOpportunity(workId, stage), "Cartão criado no CRM."), [persist]);
  const changeCrmColumns = useCallback((action) =>
    persist(() => repository.changeCrmColumns(action),
      action.type === "add" ? "Coluna adicionada." :
        action.type === "reorder" ? "Colunas reordenadas." : "Coluna excluída."), [persist]);
  const updateCrmStageLabels = useCallback((labels) =>
    persist(() => repository.updateCrmStageLabels(labels), "Colunas atualizadas."), [persist]);
  const markNotificationRead = useCallback((id) =>
    persist(() => repository.markNotificationRead(id), "Notificação marcada como lida."), [persist]);
  const deleteVisit = async () => {
    if (!deletingVisit || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await persist(
        () => repository.deleteVisit(deletingVisit.id),
        "Visita excluída.",
      );
      setDeletingVisit(null);
    } catch (error) {
      setDeleteError(error.message);
    } finally {
      setDeleteBusy(false);
    }
  };
  const navigate = (next) => {
    setPage(next);
    setNavOpen(false);
    window.scrollTo({ top: 0 });
  };
  const selectCollaborator = (next) => {
    if (!account) return setUserId(next);
    if (
      dirty &&
      !window.confirm(
        "Trocar de colaborador e descartar a visita ainda não salva?",
      )
    )
      return;
    setUserId(next);
    setActivePlan(null);
    setFormKey((key) => key + 1);
    setDirty(false);
    navigate("new");
  };
  const openVisit = (plan) => {
    setActivePlan({ ...plan, userId: plan.userId || userId });
    setFormKey((key) => key + 1);
    setDirty(false);
    setPendingPlan(null);
    navigate("new");
  };
  const startVisit = (plan) => {
    if (dirty) setPendingPlan(plan);
    else openVisit(plan);
  };
  const user = TEAM.find((item) => item.id === userId);
  const operationalData =
    ["admin", "supervisor"].includes(account?.role)
      ? {
          ...data,
          ...Object.fromEntries(
            ["works", "contacts", "visits", "plans"].map((key) => [
              key,
              data[key].filter(
                (item) =>
                  item.ownerId === userId ||
                  (key === "contacts" && isSharedContact(item)),
              ),
            ]),
          ),
        }
      : data;
  const visibleWorksCount = operationalData.works.filter(
    (item) => !item.deleted,
  ).length;
  const navigation = NAV.filter(([id]) => id !== "team" || canAssign);
  const metadata = PAGE[page];
  if (loading || loadError)
    return (
      <main className="startup">
        <img
          src={`${import.meta.env.BASE_URL}famac-logo.jpg`}
          alt="FAMAC Acabamentos"
        />
        <h1>
          {loadError
            ? "Não foi possível carregar os registros"
            : "Preparando suas próximas conexões…"}
        </h1>
        {loadError && (
          <>
            <p>{loadError}</p>
            <button
              className="button primary"
              onClick={() => location.reload()}
            >
              Tentar novamente
            </button>
          </>
        )}
      </main>
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Ir para o conteúdo
      </a>
      {navOpen && (
        <button
          className="nav-scrim"
          aria-label="Fechar navegação"
          onClick={() => setNavOpen(false)}
        />
      )}
      <aside className={`sidebar ${navOpen ? "open" : ""}`} ref={navRef}>
        <div className="sidebar-brand">
          <div className="sidebar-logo-frame">
            <img
              src={`${import.meta.env.BASE_URL}famac-logo.jpg`}
              alt="FAMAC Acabamentos"
            />
          </div>
          <p className="brand-tagline">
            Realizando sonhos ao transformar ambientes!
          </p>
          <span className="brand-system">
            VISITAÇÃO <i /> PROSPECÇÃO
          </span>
        </div>
        <span className="nav-group-label">SEU ESPAÇO DE CONEXÕES</span>
        <nav aria-label="Navegação principal">
          {navigation.map(([id, icon, label]) => (
            <button
              key={id}
              aria-label={label}
              className={`${page === id ? "active" : ""} ${id === "new" ? "new-visit-nav" : ""}`}
              aria-current={page === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon name={icon} size={19} />
              <span>{label}</span>
              {id === "new" && (
                <span className="nav-plus" aria-hidden="true">
                  +
                </span>
              )}
              {id === "works" && visibleWorksCount > 0 && (
                <small>{visibleWorksCount}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="sidebar-line" />
          <p>
            Realizando sonhos ao
            <br />
            <strong>transformar ambientes.</strong>
          </p>
          <span>
            FAMAC ACABAMENTOS <small>© {today().slice(0, 4)}</small>
          </span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button menu-toggle"
              ref={menuRef}
              aria-label="Abrir navegação"
              aria-expanded={navOpen}
              onClick={() => setNavOpen(!navOpen)}
            >
              <Icon name="menu" />
            </button>
            <span>Meu espaço</span>
            <Icon name="chevron" size={13} />
            <strong>{NAV.find((item) => item[0] === page)[2]}</strong>
          </div>
          <div className="topbar-right">
            <NotificationBell
              notifications={(data.notifications || []).filter((item) =>
                account ? account.teamId && (!item.recipientTeamId || item.recipientTeamId === account.teamId)
                  : item.recipientTeamId === userId)}
              onRead={markNotificationRead}
              onOpen={(id) => {
                setCrmFocus({ id, nonce: Date.now() });
                navigate("crm");
              }}
            />
            <span className="topbar-date">
              <Icon name="calendar" size={16} />
              {new Date(`${today()}T12:00:00`).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
              })}
            </span>
            <span className="topbar-divider" />
            <span className="avatar">
              {account?.role === "admin" ? "AD" : user.initials}
            </span>
            {canAssign ? (
              <label className="profile-select">
                <span>{account ? account.name : "Colaborador na prévia"}</span>
                <select
                  aria-label={account ? "Colaborador" : "Colaborador na prévia"}
                  value={userId}
                  onChange={(event) => selectCollaborator(event.target.value)}
                >
                  {TEAM.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <strong className="profile-name">{account.name}</strong>
            )}
            {account && (
              <div className="cloud-account-actions">
                <button
                  className="button secondary"
                  onClick={() => setPasswordOpen(true)}
                >
                  Alterar senha
                </button>
                <button
                  className="button secondary"
                  onClick={async () => {
                    if (
                      dirty &&
                      !window.confirm(
                        "Há uma visita em preenchimento. Sair e descartar os campos ainda não salvos?",
                      )
                    )
                      return;
                    try {
                      await onLogout();
                    } catch (error) {
                      setNotice(error.message);
                    }
                  }}
                >
                  Sair
                </button>
              </div>
            )}
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          <div className="page-header">
            <div>
              <span className="eyebrow">{metadata[0]}</span>
              <h1>{metadata[1]}</h1>
              <p>{metadata[2]}</p>
            </div>
          </div>
          <div hidden={page !== "new"}>
            <VisitForm
              key={formKey}
              data={operationalData}
              userId={userId}
              canAssign={!account}
              canManageSeller={canManageSeller}
              save={save}
              plan={activePlan}
              onDirty={setDirty}
              onSaved={() => {
                setActivePlan(null);
                setFormKey((key) => key + 1);
              }}
            />
          </div>
          {page === "overview" && (
            <Dashboard data={data} navigate={navigate} onDetail={setDetail} />
          )}
          {page === "visits" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Seu histórico de visitas</h2>
                  <p>Todos os registros, organizados e sempre por perto.</p>
                </div>
                <button
                  className="button primary"
                  onClick={() => navigate("new")}
                >
                  <Icon name="plus" size={17} />
                  Nova visita
                </button>
              </div>
              <VisitsTable
                visits={data.visits}
                pageSize={6}
                onDetail={setDetail}
                onDelete={(visit) => {
                  setDeletingVisit(visit);
                  setDeleteError("");
                }}
              />
            </section>
          )}
          {page === "works" && (
            <Works data={operationalData} save={save} onVisit={startVisit} onDelete={deleteRecord} canManageSeller={canManageSeller} />
          )}
          {page === "crm" && (
            <Crm
              data={data}
              actorId={userId}
              account={account}
              onAction={crmAction}
              onCreate={createCrmOpportunity}
              onColumns={changeCrmColumns}
              onLabels={updateCrmStageLabels}
              onVisit={(opportunity) =>
                startVisit({ crmOpportunityId: opportunity.id, userId })
              }
              onNew={() => navigate("new")}
              focus={crmFocus}
            />
          )}
          {page === "contacts" && (
            <Contacts data={operationalData} save={save} onDetail={setDetail} />
          )}
          {page === "schedule" && (
            <Schedule
              data={operationalData}
              userId={userId}
              canAssign={!account}
              save={save}
              onVisit={startVisit}
              onDelete={deleteRecord}
              onCrmAction={crmAction}
            />
          )}
          {page === "reports" && (
            <Reports
              data={data}
              onDetail={setDetail}
              team={
                account?.role === "collaborator"
                  ? TEAM.filter((user) => user.id === account.teamId)
                  : TEAM
              }
            />
          )}
          {page === "catalog" && (
            <Catalog data={data} save={save} canManage={canManageCatalog} />
          )}
          {page === "team" && canAssign && (
            <Team
              data={data}
              userId={userId}
              onUserChange={selectCollaborator}
              account={account}
            />
          )}
          <footer className="workspace-footer">
            <span>
              FAMAC <b>Acabamentos</b>
            </span>
            <span>Conexões que transformam ambientes.</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <span>
            <Icon name="check" size={18} />
          </span>
          {notice}
          <button
            className="icon-button"
            aria-label="Fechar aviso"
            onClick={() => setNotice("")}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {detail && <VisitDetail visit={detail} onClose={() => setDetail(null)} />}
      {deletingVisit && (
        <Modal
          title="Excluir visita?"
          onClose={() => !deleteBusy && setDeletingVisit(null)}
        >
          <p>
            A visita de <strong>{deletingVisit.workName}</strong>, realizada em{" "}
            {new Date(`${deletingVisit.date}T12:00:00`).toLocaleDateString(
              "pt-BR",
            )}, sairá das listas e dos indicadores de visitas.
          </p>
          <p>O registro original ficará preservado para auditoria.</p>
          {deletingVisit.sold.length > 0 && (
            <p>O fechamento e seu valor continuarão no CRM e no financeiro.</p>
          )}
          {deleteError && <p className="error" role="alert">{deleteError}</p>}
          <footer className="modal-actions">
            <button
              className="button secondary"
              disabled={deleteBusy}
              onClick={() => setDeletingVisit(null)}
            >
              Cancelar
            </button>
            <button
              className="button primary"
              disabled={deleteBusy}
              onClick={deleteVisit}
            >
              {deleteBusy ? "Excluindo…" : "Excluir visita"}
            </button>
          </footer>
        </Modal>
      )}
      {passwordOpen && <PasswordForm onClose={() => setPasswordOpen(false)} />}
      {pendingPlan && (
        <Modal title="Abrir outra visita?" onClose={() => setPendingPlan(null)}>
          <p>
            Há uma visita em preenchimento. Ao abrir esta obra, os campos e as
            fotos ainda não salvos serão descartados.
          </p>
          <footer className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setPendingPlan(null)}
            >
              Continuar preenchendo
            </button>
            <button
              className="button primary"
              onClick={() => openVisit(pendingPlan)}
            >
              Abrir outra visita
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <AppBoundary>
    <AuthGate>
      {(account, logout) => (
        <App
          key={account?.authId || "local"}
          account={account}
          onLogout={logout}
        />
      )}
    </AuthGate>
  </AppBoundary>,
);

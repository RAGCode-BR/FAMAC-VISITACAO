import React, { useEffect, useState } from "react";
import {
  CRM_STAGES,
  businessSales,
  crmTimeline,
  emptyCrm,
  filterBusinessSales,
} from "../lib/crm.mjs";
import {
  TEAM,
  addressLabel,
  csvCell,
  dateLabel,
  money,
  normalize,
  person,
  productNames,
  today,
} from "../lib/domain.mjs";
import { Badge, Empty, Field, Icon, Metric, Modal, Select } from "./ui.jsx";
import Pagination from "./Pagination.jsx";
import "../crm.css";

const active = (item) => !["won", "lost"].includes(item.stage);
const overdue = (item) =>
  active(item) && item.nextDate && item.nextDate < today();
export default function Crm({
  data,
  actorId,
  account,
  onAction,
  onVisit,
  onNew,
}) {
  const crm = data.crm || emptyCrm();
  const [query, setQuery] = useState("");
  const [responsible, setResponsible] = useState("");
  const [returns, setReturns] = useState("");
  const [mobileStage, setMobileStage] = useState("prospecting");
  const [dialog, setDialog] = useState(null);
  const [drop, setDrop] = useState("");
  const [view, setView] = useState("board");
  const [closedStage, setClosedStage] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [query, responsible, closedStage, view]);
  const filtered = crm.opportunities.filter(
    (item) =>
      (!responsible || item.responsibleId === responsible) &&
      (!returns ||
        (returns === "overdue"
          ? overdue(item)
          : active(item) && item.nextDate === today())) &&
      normalize(
        [
          item.work.name,
          item.work.neighborhood,
          item.work.city,
          item.work.architectName,
          item.work.contractorName,
          ...item.products,
        ].join(" "),
      ).includes(normalize(query)),
  );
  const archived = filtered
    .filter(
      (item) => !active(item) && (!closedStage || item.stage === closedStage),
    )
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
    );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(archived.length / 12)),
  );
  const showView = (next, stage = "") => {
    setView(next);
    setClosedStage(stage);
    setReturns("");
    setPage(1);
  };
  const open = (
    item,
    type = "update",
    stage = item.stage,
    version = item.version,
  ) => setDialog({ id: item.id, type, stage, version });
  const selected = crm.opportunities.find((item) => item.id === dialog?.id);
  const visit = (item) => {
    setDialog(null);
    onVisit(item);
  };
  const dropped = (event, stage) => {
    event.preventDefault();
    setDrop("");
    try {
      const source = JSON.parse(
        event.dataTransfer.getData("application/x-famac-crm"),
      );
      const item = crm.opportunities.find((row) => row.id === source.id);
      if (!item || item.stage === stage) return;
      const type =
        stage === "won"
          ? "sale"
          : stage === "lost"
            ? "lose"
            : active(item)
              ? "update"
              : "reopen";
      open(item, type, stage, source.version);
    } catch {}
  };
  return (
    <div className="crm-page">
      <div className="crm-intro">
        <div>
          <span className="crm-shared">
            <Icon name="users" size={15} />
            Compartilhado com a equipe
          </span>
        </div>
        <button className="button primary" onClick={onNew}>
          <Icon name="plus" size={17} />
          Registrar visita
        </button>
      </div>
      <div className="metrics crm-metrics">
        <Metric
          label="Oportunidades abertas"
          value={crm.opportunities.filter(active).length}
          detail="Obras em acompanhamento"
          icon="building"
        />
        <Metric
          label="Em negociação"
          value={
            crm.opportunities.filter((item) => item.stage === "negotiating")
              .length
          }
          detail="Conversas próximas do fechamento"
          icon="trend"
        />
        <Metric
          label="Retornos em atraso"
          value={crm.opportunities.filter(overdue).length}
          detail="Próximas ações que precisam de atenção"
          icon="clock"
        />
        <Metric
          label="Vendas no CRM"
          value={money(
            crm.sales.reduce((total, sale) => total + sale.value, 0),
          )}
          detail={`${crm.sales.length} fechamentos, incluindo os das visitas`}
          icon="chart"
          accent
        />
      </div>
      <section className="crm-workspace" aria-label="Quadro de oportunidades">
        <div
          className="crm-view-tabs"
          role="group"
          aria-label="Visualização do CRM"
        >
          <button
            aria-pressed={view === "board"}
            onClick={() => showView("board")}
          >
            <Icon name="kanban" size={17} /> Em andamento
            <span>{crm.opportunities.filter(active).length}</span>
          </button>
          <button
            aria-pressed={view === "closed"}
            onClick={() => showView("closed")}
          >
            <Icon name="check" size={17} /> Encerradas
            <span>
              {crm.opportunities.filter((item) => !active(item)).length}
            </span>
          </button>
        </div>
        <div className="crm-toolbar">
          <div className="search-input">
            <Icon name="search" size={17} />
            <input
              aria-label="Buscar oportunidades"
              placeholder="Obra, bairro, contato ou produto…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Select
            label="Responsável pela oportunidade"
            value={responsible}
            onChange={setResponsible}
          >
            <option value="">Toda a equipe</option>
            {TEAM.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          {view === "closed" ? (
            <Select
              label="Resultado da negociação"
              value={closedStage}
              onChange={setClosedStage}
            >
              <option value="">Todos os resultados</option>
              <option value="won">Venda realizada</option>
              <option value="lost">Sem negócio</option>
            </Select>
          ) : (
            <Select
              label="Próximo retorno"
              value={returns}
              onChange={setReturns}
            >
              <option value="">Todos os retornos</option>
              <option value="today">Para hoje</option>
              <option value="overdue">Em atraso</option>
            </Select>
          )}
        </div>
        {view === "board" ? (
          <>
            <div className="crm-board-tip">
              <span>
                <Icon name="kanban" size={16} />
                Uma oportunidade por obra. Todas as visitas no mesmo fluxo.
              </span>
              <small>
                Abra um cartão para atualizar ou arraste entre as etapas.
              </small>
            </div>
            <div
              className="crm-mobile-tabs"
              role="group"
              aria-label="Etapas do CRM"
            >
              {Object.entries(CRM_STAGES).map(([id, label]) => (
                <button
                  key={id}
                  className={mobileStage === id ? "active" : ""}
                  onClick={() => setMobileStage(id)}
                >
                  {label}
                  <span>
                    {filtered.filter((item) => item.stage === id).length}
                  </span>
                </button>
              ))}
            </div>
            <div className="crm-board">
              {Object.entries(CRM_STAGES).map(([stage, label]) => {
                const items = filtered
                  .filter((item) => item.stage === stage)
                  .sort(
                    (a, b) =>
                      Number(overdue(b)) - Number(overdue(a)) ||
                      (a.nextDate || "9999").localeCompare(
                        b.nextDate || "9999",
                      ) ||
                      b.updatedAt.localeCompare(a.updatedAt),
                  );
                return (
                  <section
                    key={stage}
                    className={`crm-column crm-${stage} ${mobileStage === stage ? "mobile-selected" : ""} ${drop === stage ? "drop-target" : ""}`}
                    aria-label={label}
                    onDragOver={(event) => {
                      if (
                        event.dataTransfer.types.includes(
                          "application/x-famac-crm",
                        )
                      ) {
                        event.preventDefault();
                        setDrop(stage);
                      }
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget))
                        setDrop("");
                    }}
                    onDrop={(event) => dropped(event, stage)}
                  >
                    <header className="crm-column-heading">
                      <span>
                        <i />
                        {label}
                      </span>
                      <b>{items.length}</b>
                    </header>
                    <div className="crm-column-cards">
                      {!active({ stage }) ? (
                        <div className="crm-closed-summary">
                          <Icon
                            name={stage === "won" ? "check" : "kanban"}
                            size={27}
                          />
                          <strong>
                            {items.length}{" "}
                            {stage === "won"
                              ? "com venda realizada"
                              : "sem negócio"}
                          </strong>
                          <p>
                            Consulte os registros e o histórico na lista de
                            encerradas.
                          </p>
                          <button
                            className="button secondary"
                            onClick={() => showView("closed", stage)}
                          >
                            {stage === "won"
                              ? "Consultar vendas"
                              : "Consultar encerradas"}
                            <Icon name="arrow" size={15} />
                          </button>
                        </div>
                      ) : (
                        items.map((item) => (
                          <article
                            className="crm-card"
                            key={item.id}
                            draggable
                            onDragStart={(event) =>
                              event.dataTransfer.setData(
                                "application/x-famac-crm",
                                JSON.stringify({
                                  id: item.id,
                                  version: item.version,
                                }),
                              )
                            }
                          >
                            <div className="crm-card-top">
                              <Badge
                                tone={
                                  item.work.type === "Comercial" ? "blue" : ""
                                }
                              >
                                {item.work.type}
                              </Badge>
                              {item.completedProducts.length > 0 &&
                                active(item) && (
                                  <span className="crm-partial">
                                    Venda parcial
                                  </span>
                                )}
                            </div>
                            <button
                              className="crm-card-title"
                              onClick={() =>
                                open(item, active(item) ? "update" : "details")
                              }
                            >
                              {item.work.name}
                            </button>
                            <p className="crm-card-address">
                              <Icon name="visit" size={14} />
                              {item.work.neighborhood} · {item.work.city}
                            </p>
                            {(item.work.architectName ||
                              item.work.contractorName) && (
                              <p className="crm-card-contact">
                                {item.work.architectName ||
                                  item.work.contractorName}
                              </p>
                            )}
                            <div className="crm-product-chips">
                              {(active(item)
                                ? item.pendingProducts
                                : item.products
                              )
                                .slice(0, 3)
                                .map((name) => (
                                  <span key={name}>{name}</span>
                                ))}
                              {(active(item)
                                ? item.pendingProducts
                                : item.products
                              ).length > 3 && (
                                <span>
                                  +
                                  {(active(item)
                                    ? item.pendingProducts
                                    : item.products
                                  ).length - 3}
                                </span>
                              )}
                            </div>
                            {item.nextAction && active(item) && (
                              <div
                                className={`crm-card-next ${overdue(item) ? "late" : ""}`}
                              >
                                <Icon name="clock" size={14} />
                                <span>
                                  {item.nextDate && (
                                    <strong>
                                      {overdue(item) ? "Em atraso · " : ""}
                                      {dateLabel(item.nextDate)}
                                    </strong>
                                  )}
                                  {item.nextAction}
                                </span>
                              </div>
                            )}
                            <div className="crm-card-owner">
                              <span className="avatar">
                                {
                                  TEAM.find(
                                    (row) => row.id === item.responsibleId,
                                  )?.initials
                                }
                              </span>
                              <span>
                                {person(item.responsibleId)}
                                <small>Responsável atual</small>
                              </span>
                              <small>
                                {
                                  crm.visitLinks.filter(
                                    (link) => link.opportunityId === item.id,
                                  ).length
                                }{" "}
                                visitas
                              </small>
                            </div>
                            <footer>
                              <button
                                className="button text-button"
                                aria-label={`Abrir oportunidade ${item.work.name}`}
                                onClick={() =>
                                  open(
                                    item,
                                    active(item) ? "update" : "details",
                                  )
                                }
                              >
                                Abrir oportunidade
                                <Icon name="arrow" size={15} />
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`Registrar visita em ${item.work.name}`}
                                onClick={() => visit(item)}
                              >
                                <Icon name="plus" size={18} />
                              </button>
                            </footer>
                          </article>
                        ))
                      )}
                    </div>
                    {!items.length && active({ stage }) && (
                      <div className="crm-column-empty">
                        <Icon
                          name={stage === "won" ? "check" : "kanban"}
                          size={25}
                        />
                        <p>
                          {crm.opportunities.length
                            ? "Nenhuma oportunidade nesta etapa"
                            : "As oportunidades das visitas aparecerão aqui"}
                        </p>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
            {!filtered.length && !!crm.opportunities.length && (
              <p className="crm-no-results">
                Nenhuma oportunidade corresponde aos filtros.
              </p>
            )}
          </>
        ) : (
          <div className="crm-archive">
            <div className="crm-archive-heading">
              <div>
                <h2>Negociações encerradas</h2>
                <p>
                  Histórico preservado. Abra uma obra para consultar ou reabrir
                  a negociação.
                </p>
              </div>
              <Badge>{archived.length} registros</Badge>
            </div>
            <div className="crm-archive-list">
              {archived
                .slice((currentPage - 1) * 12, currentPage * 12)
                .map((item) => (
                  <article className="crm-archive-row" key={item.id}>
                    <div className="crm-archive-work">
                      <Badge tone={item.stage === "won" ? "success" : ""}>
                        {CRM_STAGES[item.stage]}
                      </Badge>
                      <button
                        className="crm-card-title"
                        onClick={() => open(item, "details")}
                      >
                        {item.work.name}
                      </button>
                      <p>
                        {item.work.neighborhood} · {item.work.city}
                      </p>
                      <small>{item.products.join(" · ")}</small>
                    </div>
                    <div className="crm-archive-meta">
                      <span>
                        Responsável<strong>{person(item.responsibleId)}</strong>
                      </span>
                      <span>
                        Última atualização
                        <strong>
                          {new Date(item.updatedAt).toLocaleDateString("pt-BR")}
                        </strong>
                      </span>
                      <span>
                        Total vendido
                        <strong>
                          {money(
                            crm.sales
                              .filter((sale) => sale.opportunityId === item.id)
                              .reduce((total, sale) => total + sale.value, 0),
                          )}
                        </strong>
                      </span>
                    </div>
                    <button
                      className="button secondary"
                      aria-label={`Abrir oportunidade ${item.work.name}`}
                      onClick={() => open(item, "details")}
                    >
                      Ver histórico <Icon name="arrow" size={15} />
                    </button>
                  </article>
                ))}
            </div>
            {!archived.length && (
              <Empty
                icon="check"
                title="Nenhuma negociação encerrada"
                description="As obras encerradas aparecerão aqui. Confira também os filtros selecionados."
              />
            )}
            <Pagination
              page={currentPage}
              totalItems={archived.length}
              pageSize={12}
              onChange={setPage}
              itemLabel="negociações encerradas"
            />
          </div>
        )}
      </section>
      {selected && (
        <CrmDialog
          key={`${selected.id}-${dialog.type}-${dialog.version}`}
          opportunity={selected}
          initial={dialog}
          crm={crm}
          data={data}
          actorId={actorId}
          account={account}
          onAction={onAction}
          onClose={() => setDialog(null)}
          onVisit={() => visit(selected)}
          onMode={(type) => open(selected, type)}
        />
      )}
    </div>
  );
}

function CrmDialog({
  opportunity: item,
  initial,
  crm,
  data,
  actorId,
  account,
  onAction,
  onClose,
  onVisit,
  onMode,
}) {
  const [version, setVersion] = useState(initial.version);
  const [stage, setStage] = useState(initial.stage);
  const [responsibleId, setResponsible] = useState(item.responsibleId);
  const [nextAction, setNextAction] = useState(item.nextAction);
  const [nextDate, setNextDate] = useState(item.nextDate);
  const [note, setNote] = useState("");
  const [products, setProducts] = useState([]);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(today());
  const [seller, setSeller] = useState(actorId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const type = initial.type;
  const stale = version !== item.version;
  const events = crmTimeline(crm.activities, item.id);
  const titles = {
    update: "Próximo passo",
    sale: "Registrar venda",
    lose: "Encerrar sem negócio",
    reopen: "Reabrir negociação",
    complete: "Concluir negociação",
    details: "Resumo da oportunidade",
    note: "Registrar contato",
  };
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onAction(item.id, {
        type,
        version,
        stage,
        responsibleId,
        nextAction,
        nextDate,
        note,
        products,
        value,
        date,
        sellerTeamId: seller,
      });
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  const reconcile = () => {
    setVersion(item.version);
    setProducts((current) =>
      current.filter((name) =>
        (type === "reopen"
          ? productNames(data)
          : item.pendingProducts
        ).includes(name),
      ),
    );
    setError("");
  };
  const productOptions =
    type === "reopen" ? productNames(data) : item.pendingProducts;
  return (
    <Modal title={item.work.name} onClose={busy ? () => {} : onClose} wide>
      <div className="crm-detail-summary">
        <div>
          <Badge tone="blue">{CRM_STAGES[item.stage]}</Badge>
          <p>{addressLabel(item.work)}</p>
          {item.work.responsible && (
            <p>
              Responsável da obra: <strong>{item.work.responsible}</strong>
            </p>
          )}
          {item.work.phone && (
            <a href={`tel:${item.work.phone.replace(/\D/g, "")}`}>
              <Icon name="phone" size={14} />
              {item.work.phone}
            </a>
          )}
          <small>
            Prospecção: {person(item.prospectorId)} · Responsável atual:{" "}
            {person(item.responsibleId)}
          </small>
        </div>
        <button className="button secondary" disabled={busy} onClick={onVisit}>
          <Icon name="visit" size={16} />
          Registrar visita
        </button>
      </div>
      <div className="crm-detail-contacts">
        {item.work.architectName && (
          <span>
            Arquiteto <strong>{item.work.architectName}</strong>
          </span>
        )}
        {item.work.contractorName && (
          <span>
            Empreiteiro <strong>{item.work.contractorName}</strong>
          </span>
        )}
      </div>
      <div className="crm-detail-actions">
        {active(item) ? (
          <>
            <button
              type="button"
              className={`button ${type === "update" ? "primary" : "secondary"}`}
              disabled={busy}
              onClick={() => onMode("update")}
            >
              Atualizar
            </button>
            <button
              type="button"
              className={`button ${type === "sale" ? "primary" : "secondary"}`}
              disabled={busy || !item.pendingProducts.length}
              onClick={() => onMode("sale")}
            >
              Registrar venda
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => onMode("note")}
            >
              Registrar contato
            </button>
            <button
              type="button"
              className="button text-button delete-action"
              disabled={busy}
              onClick={() => onMode("lose")}
            >
              Sem negócio
            </button>
            {item.completedProducts.length > 0 && (
              <button
                type="button"
                className="button text-button"
                disabled={busy}
                onClick={() => onMode("complete")}
              >
                Concluir negociação
              </button>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => onMode("reopen")}
            >
              Reabrir negociação
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => onMode("note")}
            >
              Registrar contato
            </button>
          </>
        )}
      </div>
      {type !== "details" && (
        <form className="crm-action-form" onSubmit={submit}>
          <h3>{titles[type]}</h3>
          {stale && (
            <div className="crm-stale" role="alert">
              <p>
                A equipe atualizou esta oportunidade. Etapa atual:{" "}
                <strong>{CRM_STAGES[item.stage]}</strong>. Seus campos foram
                mantidos. Responsável atual: {person(item.responsibleId)}.
                Próxima ação atual: {item.nextAction || "Não informada"}
                {item.nextDate ? ` · ${dateLabel(item.nextDate)}` : ""}.
              </p>
              <button
                type="button"
                className="button secondary"
                onClick={reconcile}
              >
                Revisar com dados atuais
              </button>
            </div>
          )}
          {type === "update" && (
            <>
              <div className="fields two">
                <Select
                  label="Etapa da oportunidade"
                  value={stage}
                  onChange={setStage}
                >
                  {Object.entries(CRM_STAGES)
                    .filter(([key]) => !["won", "lost"].includes(key))
                    .map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                </Select>
                <Select
                  label="Responsável atual"
                  value={responsibleId}
                  onChange={setResponsible}
                >
                  {TEAM.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="fields two">
                <Field
                  label="Próxima ação"
                  value={nextAction}
                  maxLength={1000}
                  onChange={(event) => setNextAction(event.target.value)}
                  placeholder="Ex.: enviar orçamento ao arquiteto"
                />
                <Field
                  label="Data do próximo retorno"
                  type="date"
                  value={nextDate}
                  onChange={(event) => setNextDate(event.target.value)}
                />
              </div>
            </>
          )}
          {["sale", "reopen"].includes(type) && (
            <>
              <p>
                {type === "sale"
                  ? "Selecione apenas os produtos deste fechamento. Os demais continuam em negociação."
                  : "Escolha os produtos da nova negociação. As vendas anteriores serão preservadas."}
              </p>
              <fieldset className="crm-product-options">
                <legend>
                  {type === "sale"
                    ? "Produtos vendidos"
                    : "Produtos da negociação"}
                </legend>
                {productOptions.map((name) => (
                  <label key={name}>
                    <input
                      type="checkbox"
                      checked={products.includes(name)}
                      onChange={(event) =>
                        setProducts(
                          event.target.checked
                            ? [...products, name]
                            : products.filter((item) => item !== name),
                        )
                      }
                    />
                    {name}
                  </label>
                ))}
              </fieldset>
              {!productOptions.length && (
                <p className="inline-note">
                  Registre uma visita com os produtos de interesse para iniciar
                  a negociação.
                </p>
              )}
            </>
          )}
          {type === "sale" && (
            <>
              <div className="fields two">
                <Field
                  label="Valor deste fechamento (R$)"
                  type="number"
                  min="0"
                  max="1000000000"
                  step="0.01"
                  value={value}
                  required
                  onChange={(event) => setValue(event.target.value)}
                  hint="Informe 0 se o valor ainda não foi informado."
                />
                <Field
                  label="Data da venda"
                  type="date"
                  value={date}
                  max={today()}
                  required
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              <Select
                label="Quem realizou a venda"
                value={seller}
                onChange={setSeller}
                disabled={!!account && account.role !== "admin"}
              >
                {TEAM.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </>
          )}
          {type === "complete" && (
            <p>
              A venda parcial será mantida. Os produtos ainda pendentes serão
              encerrados sem nova venda.
            </p>
          )}
          <Field
            label={
              ["lose", "reopen", "complete"].includes(type)
                ? "Motivo"
                : type === "note"
                  ? "Ação realizada"
                  : "Observação para a equipe"
            }
          >
            <textarea
              value={note}
              maxLength={1000}
              required={["lose", "reopen", "complete", "note"].includes(type)}
              rows={3}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Conte o que aconteceu e ajude no próximo atendimento…"
            />
          </Field>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <footer className="modal-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button className="button primary" disabled={busy || stale}>
              {busy
                ? "Salvando…"
                : type === "sale"
                  ? "Confirmar venda"
                  : "Salvar ação"}
            </button>
          </footer>
        </form>
      )}
      <section className="crm-timeline" aria-label="Histórico da oportunidade">
        <h3>Uma história construída pela equipe</h3>
        {events.map((event) => (
          <article key={event.id}>
            <span
              className={`crm-timeline-dot ${event.type === "sale" ? "sale" : ""}`}
            />
            <div>
              <strong>{eventLabel(event)}</strong>
              <small>
                {event.actorName} · {new Date(event.at).toLocaleString("pt-BR")}
              </small>
              {event.note && <p>{event.note}</p>}
              {event.type === "sale" && (
                <p>
                  {event.products.join(", ")} · {money(event.value)} · Venda:{" "}
                  {person(event.sellerTeamId)} · {dateLabel(event.date)}
                </p>
              )}
              {event.type === "visit" && (
                <p>
                  {dateLabel(event.date)} ·{" "}
                  {event.products.join(", ") || "Relacionamento sem produtos"}
                </p>
              )}
              {event.type === "updated" && (
                <p>
                  Responsável: {person(event.responsibleId)}
                  {event.nextAction ? ` · ${event.nextAction}` : ""}
                  {event.nextDate ? ` · ${dateLabel(event.nextDate)}` : ""}
                </p>
              )}
            </div>
          </article>
        ))}
      </section>
    </Modal>
  );
}
function eventLabel(event) {
  return (
    {
      created: "Oportunidade aberta",
      visit: "Visita registrada",
      sale: "Venda registrada",
      note: "Contato / ação realizada",
      lost: "Encerrada sem negócio",
      reopened: "Negociação reaberta",
      completed: "Negociação concluída",
      updated:
        event.from === event.to
          ? "Próximo passo atualizado"
          : `${CRM_STAGES[event.from]} → ${CRM_STAGES[event.to]}`,
    }[event.type] || "Atualização"
  );
}

export function CrmSalesReport({ data, filters, team }) {
  const sales = filterBusinessSales(
    businessSales(data).filter((sale) =>
      team.some((user) => user.id === sale.sellerTeamId),
    ),
    filters,
  ).sort((a, b) => b.date.localeCompare(a.date));
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [filters]);
  const current = Math.min(page, Math.max(1, Math.ceil(sales.length / 10)));
  const exportSales = () => {
    const rows = [
      [
        "Data",
        "Obra",
        "Bairro",
        "Cidade",
        "Vendedor",
        "Prospecção",
        "Produtos vendidos",
        "Valor",
        "Origem",
      ],
      ...sales.map((sale) => [
        dateLabel(sale.date),
        sale.work.name,
        sale.work.neighborhood,
        sale.work.city,
        person(sale.sellerTeamId),
        person(sale.prospectorId),
        sale.products.join(", "),
        sale.value.toFixed(2).replace(".", ","),
        sale.sourceVisitId ? "Visita vinculada" : "CRM",
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "famac-fechamentos.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section className="panel crm-sales-report">
      <div className="panel-heading">
        <div>
          <h2>Fechamentos de vendas · CRM e visitas</h2>
          <p>
            Cada venda aparece uma única vez. Os filtros acima se aplicam à data
            da venda e ao vendedor.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={!sales.length}
          onClick={exportSales}
        >
          <Icon name="download" size={16} />
          Exportar vendas
        </button>
      </div>
      <div className="crm-sales-totals">
        <span>
          <strong>{sales.length}</strong> fechamentos
        </span>
        <span>
          <strong>
            {money(sales.reduce((sum, sale) => sum + sale.value, 0))}
          </strong>{" "}
          vendidos
        </span>
        <span>
          {sales.filter((sale) => !sale.sourceVisitId).length} registrados
          diretamente no CRM
        </span>
      </div>
      {sales.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Data / obra</th>
                <th>Produtos / bairro</th>
                <th>Quem vendeu</th>
                <th>Quem prospectou</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale, index) => (
                <tr
                  key={sale.id}
                  className={
                    index < (current - 1) * 10 || index >= current * 10
                      ? "crm-sale-outside-page"
                      : ""
                  }
                >
                  <td>
                    <strong>{sale.work.name}</strong>
                    <small>{dateLabel(sale.date)}</small>
                  </td>
                  <td>
                    {sale.products.join(", ")}
                    <small>
                      {sale.work.neighborhood} · {sale.work.city}
                    </small>
                  </td>
                  <td>{person(sale.sellerTeamId)}</td>
                  <td>{person(sale.prospectorId)}</td>
                  <td>{money(sale.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Nenhum fechamento neste filtro"
          description="Vendas registradas nas visitas ou no CRM aparecerão aqui."
          icon="trend"
        />
      )}
      {sales.length > 10 && (
        <div className="crm-sales-pager">
          <button
            className="button secondary"
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
          >
            Anterior
          </button>
          <span>
            {current} de {Math.ceil(sales.length / 10)}
          </span>
          <button
            className="button secondary"
            disabled={current * 10 >= sales.length}
            onClick={() => setPage(current + 1)}
          >
            Próxima
          </button>
        </div>
      )}
    </section>
  );
}

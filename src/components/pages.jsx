import React, { useMemo, useState } from "react";
import {
  productNames,
  productName,
  productKey,
  catalogProducts,
  saveProduct,
  deleteContact,
  TEAM,
  STAGES,
  addressLabel,
  dateLabel,
  filterVisits,
  money,
  newAddress,
  normalize,
  person,
  summarize,
  today,
  uid,
  serviceNumber,
  visitsCsv,
} from "../lib/domain.mjs";
import Pagination from "./Pagination.jsx";
import VisitPhoto from "./VisitPhoto.jsx";
import { CrmSalesReport } from "./Crm.jsx";
import {
  ProductGallery,
  ProductImage,
  ProductPhotoEditor,
} from "./ProductPhotos.jsx";
import { contactPhones } from "../lib/contacts.mjs";
import { teamIndicators } from "../lib/reporting.mjs";
import { ReportOverview, TeamKpis } from "./ReportInsights.jsx";
import { AccessManagement } from "./AuthGate.jsx";
import {
  AddressFields,
  Badge,
  ContactForm,
  ContactPicker,
  Empty,
  Field,
  Icon,
  Metric,
  Modal,
  Select,
} from "./ui.jsx";

export function downloadFile(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const roleName = (role) =>
  ({
    contractor: "Empreiteiro",
    architect: "Arquiteto",
    responsible: "Responsável",
  })[role];
export function VisitsTable({ visits, onDetail, onDelete }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const filtered = visits.filter((item) =>
    normalize(
      `${item.workName} ${item.neighborhood} ${item.responsible} ${item.contractorName} ${item.architectName} ${serviceNumber(item.serviceNumber)} ${item.serviceNumber || ""}`,
    ).includes(normalize(search)),
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(filtered.length / 12)),
  );
  return (
    <>
      <div className="list-toolbar">
        <div className="search-input">
          <Icon name="search" size={18} />
          <input
            aria-label="Buscar visitas"
            placeholder="Buscar OS, obra, bairro ou contato…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <small>{filtered.length} visitas encontradas</small>
      </div>
      {filtered.length ? (
        <>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Obra / visita</th>
                  <th>Localização</th>
                  <th>Colaborador</th>
                  <th>Produtos</th>
                  <th>Resultado</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...filtered]
                  .sort(
                    (a, b) =>
                      b.date.localeCompare(a.date) ||
                      b.createdAt.localeCompare(a.createdAt),
                  )
                  .slice((currentPage - 1) * 12, currentPage * 12)
                  .map((item) => (
                    <tr key={item.id}>
                      <td>
                        <button
                          className="table-link"
                          onClick={() => onDetail(item)}
                        >
                          {item.workName}
                        </button>
                        {item.serviceNumber && <small>{serviceNumber(item.serviceNumber)}</small>}
                        <small>
                          {dateLabel(item.date)} ·{" "}
                          {item.responsible || "Contato a identificar"}
                        </small>
                      </td>
                      <td>
                        {item.neighborhood}
                        <small>
                          {item.city} / {item.state}
                        </small>
                      </td>
                      <td>
                        <span className="person-cell">
                          <i>{person(item.userId).slice(0, 2).toUpperCase()}</i>
                          {person(item.userId)}
                        </span>
                      </td>
                      <td>
                        <span>{item.offered.length} oferecidos</span>
                        <small>
                          {item.sold.length
                            ? `${item.sold.length} vendidos`
                            : "Sem venda registrada"}
                        </small>
                      </td>
                      <td>
                        <Badge
                          tone={
                            item.sold.length
                              ? "success"
                              : item.stage === "relationship"
                                ? ""
                                : "blue"
                          }
                        >
                          {STAGES[item.stage]}
                        </Badge>
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Detalhes de ${item.workName}`}
                          onClick={() => onDetail(item)}
                        >
                          <Icon name="chevron" size={18} />
                        </button>
                        {onDelete && (
                          <button
                            className="icon-button delete-action"
                            aria-label={`Excluir visita de ${item.workName} em ${dateLabel(item.date)}`}
                            onClick={() => onDelete(item)}
                          >
                            <Icon name="trash" size={17} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={currentPage}
            totalItems={filtered.length}
            pageSize={12}
            onChange={setPage}
            itemLabel="visitas"
          />
        </>
      ) : (
        <Empty
          title={
            search ? "Nenhuma visita encontrada" : "Seu histórico começa aqui"
          }
          description={
            search
              ? "Tente outro nome, bairro ou contato."
              : "As visitas registradas ficam organizadas aqui para você consultar quando precisar."
          }
          icon="visit"
        />
      )}
    </>
  );
}

export function VisitDetail({ visit, onClose }) {
  return (
    <Modal title={visit.workName} onClose={onClose} wide>
      <div className="detail-top">
        {visit.serviceNumber && <Badge tone="blue">{serviceNumber(visit.serviceNumber)}</Badge>}
        <Badge tone={visit.sold.length ? "success" : "blue"}>
          {STAGES[visit.stage]}
        </Badge>
        <span>
          {dateLabel(visit.date)} · {person(visit.userId)}
        </span>
      </div>
      <dl className="detail-grid">
        <div>
          <dt>Endereço</dt>
          <dd>
            {addressLabel(visit)}
            {visit.complement && ` · ${visit.complement}`}
          </dd>
        </div>
        <div>
          <dt>CEP / tipo de obra</dt>
          <dd>
            {visit.cep || "Não informado"} · {visit.type}
          </dd>
        </div>
        <div>
          <dt>Responsável</dt>
          <dd>{visit.responsible || "A identificar"}</dd>
        </div>
        <div>
          <dt>Telefone</dt>
          <dd>
            {visit.phone ? (
              <a href={`tel:${visit.phone.replace(/\D/g, "")}`}>
                {visit.phone}
              </a>
            ) : (
              "Não informado"
            )}
          </dd>
        </div>
        <div>
          <dt>Empreiteiro</dt>
          <dd>{visit.contractorName || "Não informado"}</dd>
        </div>
        <div>
          <dt>Arquiteto</dt>
          <dd>{visit.architectName || "Não informado"}</dd>
        </div>
      </dl>
      <h3 className="detail-heading">Produtos oferecidos</h3>
      <div className="tag-list">
        {visit.offered.length === 0 && <span>Nenhum produto registrado.</span>}
        {visit.offered.map((item) => (
          <Badge
            key={item}
            tone={visit.sold.includes(item) ? "success" : "blue"}
          >
            {item}
            {visit.sold.includes(item) ? " · vendido" : " · prospectado"}
          </Badge>
        ))}
      </div>
      {visit.sold.length > 0 && (
        <p className="sale-total">
          Valor total da venda <strong>{money(visit.saleValue)}</strong>
        </p>
      )}
      <h3 className="detail-heading">Conversa e oportunidades</h3>
      <p className="pre-line">{visit.notes || "Sem observações adicionais."}</p>
      <h3 className="detail-heading">Próxima ação</h3>
      <p className="pre-line">
        {visit.nextAction || "Nenhuma ação informada."}
      </p>
      {visit.scheduleNext && (
        <p>Retorno programado para {dateLabel(visit.nextDate)}.</p>
      )}
      {visit.photos.length > 0 && (
        <>
          <h3 className="detail-heading">Fotos da obra</h3>
          <div className="detail-photos">
            {visit.photos.map((photo) => (
              <VisitPhoto
                key={photo.id}
                photo={photo}
                alt={`Obra: ${photo.name}`}
              />
            ))}
          </div>
        </>
      )}
      <footer className="modal-actions">
        <button className="button secondary" onClick={onClose}>
          Fechar detalhes
        </button>
      </footer>
    </Modal>
  );
}

export function Dashboard({ data, navigate, onDetail }) {
  const visits = data.visits.filter(
    (item) => item.date.slice(0, 7) === today().slice(0, 7),
  );
  const stats = summarize(visits, productNames(data));
  const upcoming = data.plans
    .filter((item) => item.status === "planned" && item.date >= today())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  return (
    <>
      <section className="overview-hero">
        <div>
          <span className="eyebrow">PRESENÇA QUE GERA RESULTADOS</span>
          <h2>
            Mais perto da obra.
            <br />
            Mais perto do próximo negócio.
          </h2>
          <p>
            Conecte pessoas, descubra oportunidades e acompanhe cada conquista.
          </p>
          <button className="button white" onClick={() => navigate("new")}>
            <Icon name="plus" size={18} />
            Registrar uma visita
            <Icon name="arrow" size={18} />
          </button>
        </div>
        <div className="hero-building" aria-hidden="true">
          <i />
          <i />
          <i />
          <b>F</b>
        </div>
      </section>
      <div className="section-label">
        <h2>Seu mês em movimento</h2>
        <span>
          {new Date(`${today()}T12:00:00`).toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric",
          })}
        </span>
      </div>
      <div className="metrics">
        <Metric
          label="Visitas realizadas"
          value={stats.visits}
          detail="Visitas registradas neste mês"
          icon="visit"
        />
        <Metric
          label="Obras visitadas"
          value={stats.works}
          detail="Obras diferentes no período"
          icon="building"
        />
        <Metric
          label="Visitas com venda"
          value={stats.sales}
          detail={`${stats.conversion}% das visitas do mês`}
          icon="trend"
        />
        <Metric
          label="Valor vendido"
          value={money(stats.value)}
          detail="Valores informados nos registros"
          icon="chart"
          accent
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Próximas conexões</h2>
              <p>Visitas que já estão no seu radar.</p>
            </div>
            <button
              className="button text-button"
              onClick={() => navigate("schedule")}
            >
              Ver agenda
              <Icon name="arrow" size={16} />
            </button>
          </div>
          {upcoming.length ? (
            upcoming.map((item) => (
              <div className="agenda-row" key={item.id}>
                <span className="date-tile">
                  <strong>{item.date.slice(8, 10)}</strong>
                  <small>
                    {new Date(`${item.date}T12:00:00`)
                      .toLocaleDateString("pt-BR", { month: "short" })
                      .replace(".", "")}
                  </small>
                </span>
                <div>
                  <strong>{item.workName}</strong>
                  <small>
                    {person(item.userId)} ·{" "}
                    {
                      data.works.find((work) => work.id === item.workId)
                        ?.neighborhood
                    }
                  </small>
                </div>
                <Badge>Programada</Badge>
              </div>
            ))
          ) : (
            <Empty
              title="Sua agenda está livre"
              description="Você pode visitar uma obra agora ou programar os próximos encontros."
              icon="calendar"
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Produtos em destaque</h2>
              <p>O que está despertando interesse neste mês.</p>
            </div>
            <Icon name="box" />
          </div>
          {stats.products.some((item) => item.offered) ? (
            <Ranking
              items={stats.products
                .filter((item) => item.offered)
                .sort((a, b) => b.offered - a.offered)
                .slice(0, 5)
                .map((item) => ({ name: item.name, value: item.offered }))}
              unit="visitas"
            />
          ) : (
            <Empty
              title="As oportunidades vão aparecer"
              description="Registre os produtos oferecidos em cada visita para acompanhar os interesses."
              icon="box"
            />
          )}
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Últimas visitas</h2>
            <p>Uma história de conexões, obra por obra.</p>
          </div>
          <button
            className="button text-button"
            onClick={() => navigate("visits")}
          >
            Ver todas
            <Icon name="arrow" size={16} />
          </button>
        </div>
        <VisitsTable visits={data.visits.slice(-5)} onDetail={onDetail} />
      </section>
    </>
  );
}

export function Contacts({ data, save, onDetail }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const contacts = data.contacts
    .filter(
      (item) =>
        !item.deleted &&
        (!role || item.role === role) &&
        normalize(
          `${item.name} ${item.company || ""} ${item.city || ""}`,
        ).includes(normalize(search)),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(contacts.length / 12)),
  );
  return (
    <>
      <div className="directory-intro">
        <div>
          <h2>Uma boa rede faz a diferença.</h2>
          <p>
            Empreiteiros, arquitetos e responsáveis que fazem parte dos seus
            projetos.
          </p>
        </div>
        <button className="button primary" onClick={() => setEditing({})}>
          <Icon name="plus" size={18} />
          Novo contato
        </button>
      </div>
      <section className="panel">
        <div className="list-toolbar">
          <div className="tabs" role="group" aria-label="Tipo de contato">
            {[
              ["", "Todos"],
              ["contractor", "Empreiteiros"],
              ["architect", "Arquitetos"],
              ["responsible", "Responsáveis"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={role === id ? "active" : ""}
                onClick={() => {
                  setRole(id);
                  setPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="search-input">
            <Icon name="search" size={17} />
            <input
              aria-label="Buscar contatos"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Buscar nome, cidade ou empresa…"
            />
          </div>
        </div>
        {contacts.length ? (
          <div className="contact-grid">
            {contacts
              .slice((currentPage - 1) * 12, currentPage * 12)
              .map((item) => {
                const visits = data.visits.filter(
                  (visit) =>
                    visit.contractorId === item.id ||
                    visit.architectId === item.id,
                );
                return (
                  <article className="contact-card" key={item.id}>
                    <div className="card-top">
                      <span className="contact-avatar">
                        {item.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="record-actions">
                        <button
                          className="icon-button"
                          aria-label={`Editar ${item.name}`}
                          onClick={() => setEditing(item)}
                        >
                          <Icon name="edit" size={17} />
                        </button>
                        <button
                          className="icon-button delete-action"
                          aria-label={`Excluir ${item.name}`}
                          onClick={() => setDeleting(item)}
                        >
                          <Icon name="trash" size={17} />
                        </button>
                      </div>
                    </div>
                    <h3>{item.name}</h3>
                    <Badge tone={item.role === "architect" ? "blue" : ""}>
                      {roleName(item.role)}
                    </Badge>
                    {item.company && <p>{item.company}</p>}
                    {item.city && <p>{item.city}</p>}
                    {contactPhones(item).map((phone) => (
                      <a
                        key={phone}
                        className="contact-phone"
                        href={`tel:${phone.replace(/\D/g, "")}`}
                      >
                        <Icon name="phone" size={15} />
                        {phone}
                      </a>
                    ))}
                    <div className="card-bottom">
                      <span>{visits.length} visitas vinculadas</span>
                      {visits.length > 0 && (
                        <button
                          className="button text-button"
                          onClick={() => onDetail(visits.at(-1))}
                        >
                          Última visita
                          <Icon name="arrow" size={14} />
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
          </div>
        ) : (
          <Empty
            title={
              search || role
                ? "Nenhum contato encontrado"
                : "Sua próxima conexão começa aqui"
            }
            description="Cadastre contatos por aqui ou durante uma nova visita. Nenhum contato do projeto anterior foi importado."
            icon="users"
            action={
              <button
                className="button secondary"
                onClick={() => setEditing({})}
              >
                <Icon name="plus" size={17} />
                Cadastrar contato
              </button>
            }
          />
        )}
        <Pagination
          page={currentPage}
          totalItems={contacts.length}
          pageSize={12}
          onChange={setPage}
          itemLabel="contatos"
        />
      </section>
      {editing && (
        <ContactForm
          initial={editing.id ? editing : undefined}
          data={data}
          save={save}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <DeleteRecord
          title="Excluir contato?"
          name={deleting.name}
          description="O contato sairá da lista compartilhada e das opções para novos vínculos. Obras, visitas e relatórios anteriores serão preservados."
          save={save}
          update={(current) => deleteContact(current, deleting.id)}
          message="Contato excluído."
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

function WorkForm({ initial, data, save, onClose }) {
  const [form, setForm] = useState(
    initial || {
      name: "",
      type: "Residencial",
      responsible: "",
      phone: "",
      ...newAddress(),
      contractorId: "",
      architectId: "",
      contractorQuery: "",
      architectQuery: "",
    },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (patch) => setForm((current) => ({ ...current, ...patch }));
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (
      !form.name.trim() ||
      !form.neighborhood.trim() ||
      !form.street.trim() ||
      !form.city.trim()
    )
      return setError("Preencha o nome, a rua, o bairro e a cidade da obra.");
    if (
      (form.contractorQuery && !form.contractorId) ||
      (form.architectQuery && !form.architectId)
    )
      return setError(
        "Selecione os contatos na lista ou use + para cadastrá-los.",
      );
    setBusy(true);
    try {
      const work = {
        ...form,
        name: form.name.trim(),
        id: form.id || uid(),
        updatedAt: new Date().toISOString(),
      };
      await save(
        (current) => ({
          ...current,
          works: form.id
            ? current.works.map((item) => (item.id === form.id ? work : item))
            : [...current.works, work],
        }),
        "Obra salva.",
      );
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={form.id ? "Editar obra" : "Nova obra"} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="fields two">
          <Field
            label="Nome da obra"
            required
            value={form.name}
            maxLength={180}
            onChange={(event) => update({ name: event.target.value })}
            autoFocus
          />
          <Select
            label="Tipo de obra"
            value={form.type}
            onChange={(type) => update({ type })}
          >
            <option>Residencial</option>
            <option>Comercial</option>
          </Select>
        </div>
        <AddressFields value={form} onChange={update} />
        <div className="fields two">
          <Field
            label="Responsável pela obra"
            value={form.responsible}
            maxLength={180}
            onChange={(event) => update({ responsible: event.target.value })}
          />
          <Field
            label="Telefone"
            type="tel"
            value={form.phone}
            maxLength={25}
            onChange={(event) => update({ phone: event.target.value })}
          />
        </div>
        <div className="fields two">
          <ContactPicker
            label="Empreiteiro"
            role="contractor"
            data={data}
            save={save}
            value={form.contractorId}
            query={form.contractorQuery || ""}
            onQuery={(contractorQuery) => update({ contractorQuery })}
            onChange={(contractorId, contractorQuery) =>
              update({ contractorId, contractorQuery })
            }
          />
          <ContactPicker
            label="Arquiteto"
            role="architect"
            data={data}
            save={save}
            value={form.architectId}
            query={form.architectQuery || ""}
            onQuery={(architectQuery) => update({ architectQuery })}
            onChange={(architectId, architectQuery) =>
              update({ architectId, architectQuery })
            }
          />
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar obra"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export function Works({ data, save, onVisit, onDelete }) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const works = data.works
    .filter(
      (item) =>
        (!type || item.type === type) &&
        normalize(
          `${item.name} ${item.neighborhood} ${item.city} ${item.responsible}`,
        ).includes(normalize(query)),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(works.length / 12)));
  return (
    <>
      <div className="directory-intro">
        <div>
          <h2>Todo projeto tem um endereço.</h2>
          <p>
            Conheça as obras, mantenha os contatos por perto e encontre a
            próxima oportunidade.
          </p>
        </div>
        <button className="button primary" onClick={() => setEditing({})}>
          <Icon name="plus" size={18} />
          Nova obra
        </button>
      </div>
      <section className="panel">
        <div className="list-toolbar">
          <div className="search-input">
            <Icon name="search" size={18} />
            <input
              value={query}
              aria-label="Buscar obras"
              placeholder="Buscar obra, bairro ou responsável…"
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            aria-label="Filtrar tipo de obra"
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos os tipos de obra</option>
            <option>Residencial</option>
            <option>Comercial</option>
          </select>
          <span className="count-label">{works.length} obras</span>
        </div>
        {works.length ? (
          <div className="works-grid">
            {works
              .slice((currentPage - 1) * 12, currentPage * 12)
              .map((item) => {
                const visits = data.visits.filter(
                  (visit) => visit.workId === item.id,
                );
                return (
                  <article className="work-card" key={item.id}>
                    <div className="work-card-header">
                      <span className="work-symbol">
                        <Icon name="building" size={27} />
                      </span>
                      <Badge tone={item.type === "Comercial" ? "blue" : ""}>
                        {item.type}
                      </Badge>
                    </div>
                    <h3>{item.name}</h3>
                    <p className="work-location">
                      <Icon name="visit" size={15} />
                      {item.neighborhood} · {item.city}/{item.state}
                    </p>
                    <p className="muted">
                      {item.street}
                      {item.number && `, ${item.number}`}
                    </p>
                    <dl>
                      <div>
                        <dt>Empreiteiro</dt>
                        <dd>
                          {data.contacts.find(
                            (contact) => contact.id === item.contractorId,
                          )?.name || "Não informado"}
                        </dd>
                      </div>
                      <div>
                        <dt>Arquiteto</dt>
                        <dd>
                          {data.contacts.find(
                            (contact) => contact.id === item.architectId,
                          )?.name || "Não informado"}
                        </dd>
                      </div>
                    </dl>
                    <div className="work-stats">
                      <span>
                        <b>{visits.length}</b> visitas
                      </span>
                      <span>
                        <b>
                          {visits.filter((visit) => visit.sold.length).length}
                        </b>{" "}
                        com venda
                      </span>
                    </div>
                    <div className="card-bottom">
                      <button className="button text-button" onClick={() => setDeleting(item)} aria-label={`Excluir obra ${item.name}`}>
                        Excluir
                      </button>
                      <button
                        className="button text-button"
                        onClick={() =>
                          setEditing({
                            ...item,
                            contractorQuery:
                              data.contacts.find(
                                (contact) => contact.id === item.contractorId,
                              )?.name || "",
                            architectQuery:
                              data.contacts.find(
                                (contact) => contact.id === item.architectId,
                              )?.name || "",
                          })
                        }
                      >
                        <Icon name="edit" size={15} />
                        Editar
                      </button>
                      <button
                        className="button secondary small"
                        onClick={() => onVisit({ workId: item.id })}
                      >
                        Visitar obra
                        <Icon name="arrow" size={15} />
                      </button>
                    </div>
                  </article>
                );
              })}
          </div>
        ) : (
          <Empty
            title="Um mapa de novas possibilidades"
            description="Cadastre uma obra ou registre sua primeira visita. A obra será criada automaticamente a partir dela."
            icon="building"
            action={
              <button
                className="button secondary"
                onClick={() => setEditing({})}
              >
                <Icon name="plus" size={17} />
                Cadastrar obra
              </button>
            }
          />
        )}
        <Pagination
          page={currentPage}
          totalItems={works.length}
          pageSize={12}
          onChange={setPage}
          itemLabel="obras"
        />
      </section>
      {editing && (
        <WorkForm
          initial={editing.id ? editing : undefined}
          data={data}
          save={save}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && <DeleteRecord title="Excluir obra?" name={deleting.name}
        description="A obra e suas programações sairão das listas. As visitas realizadas e vendas serão preservadas."
        action={() => onDelete("works", deleting.id)} onClose={() => setDeleting(null)} />}
    </>
  );
}

function PlanForm({ data, userId, save, onClose, canAssign = true }) {
  const [form, setForm] = useState({
    workId: "",
    userId,
    date: today(),
    notes: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!form.workId) return setError("Selecione uma obra cadastrada.");
    if (form.date < today())
      return setError("Selecione hoje ou uma data futura.");
    setBusy(true);
    try {
      await save((current) => {
        if (
          current.plans.some(
            (item) =>
              item.workId === form.workId &&
              item.userId === form.userId &&
              item.date === form.date &&
              item.status === "planned",
          )
        )
          throw new Error(
            "Já existe uma visita programada para essa obra, colaborador e data.",
          );
        const work = current.works.find((item) => item.id === form.workId);
        return {
          ...current,
          plans: [
            ...current.plans,
            { ...form, id: uid(), workName: work.name, status: "planned" },
          ],
        };
      }, "Visita programada.");
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Programar visita" onClose={onClose}>
      <form onSubmit={submit}>
        <Select
          label="Obra"
          value={form.workId}
          onChange={(workId) => setForm({ ...form, workId })}
          required
        >
          <option value="">Selecione uma obra</option>
          {data.works.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name} · {item.neighborhood}
            </option>
          ))}
        </Select>
        <div className="fields two">
          <Field
            label="Data da visita"
            type="date"
            min={today()}
            value={form.date}
            onChange={(event) => setForm({ ...form, date: event.target.value })}
            required
          />
          <Select
            label="Colaborador"
            disabled={!canAssign}
            value={form.userId}
            onChange={(userId) => setForm({ ...form, userId })}
          >
            {TEAM.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </div>
        <Field label="Objetivo / próxima ação">
          <textarea
            value={form.notes}
            onChange={(event) =>
              setForm({ ...form, notes: event.target.value })
            }
            maxLength={2000}
            placeholder="O que vamos desenvolver nessa visita?"
          />
        </Field>
        {!data.works.length && (
          <p className="inline-note">
            Cadastre uma obra na aba Obras antes de programar uma visita.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="button primary"
            disabled={busy || !data.works.length}
          >
            {busy ? "Salvando…" : "Salvar programação"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function CancelPlan({ plan, save, onClose }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (!reason.trim()) return setError("Informe o motivo.");
    setBusy(true);
    try {
      await save(
        (current) => ({
          ...current,
          plans: current.plans.map((item) =>
            item.id === plan.id
              ? { ...item, status: "cancelled", reason: reason.trim() }
              : item,
          ),
        }),
        "Programação marcada como não realizada.",
      );
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Visita não realizada" onClose={onClose}>
      <form onSubmit={submit}>
        <p>
          {plan.workName} · {dateLabel(plan.date)}
        </p>
        <Field
          label="Motivo"
          required
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Ex.: responsável não estava no local"
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Voltar
          </button>
          <button className="button primary" disabled={busy}>
            Salvar motivo
          </button>
        </footer>
      </form>
    </Modal>
  );
}
export function Schedule({ data, userId, save, onVisit, onDelete, onCrmAction, canAssign = true }) {
  const [date, setDate] = useState(today());
  const [period, setPeriod] = useState("month");
  const [user, setUser] = useState("");
  const [status, setStatus] = useState("");
  const [adding, setAdding] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [deletingCrmReturn, setDeletingCrmReturn] = useState(null);
  const inPeriod = (value) => {
    if (period === "day") return value === date;
    if (period === "month") return value.slice(0, 7) === date.slice(0, 7);
    const start = new Date(`${date}T12:00:00`);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const current = new Date(`${value}T12:00:00`);
    return current >= start && current < end;
  };
  const plans = data.plans
    .filter(
      (item) =>
        inPeriod(item.date) &&
        (!user || item.userId === user) &&
        (!status || item.status === status),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const isCrmReturn = (item) =>
    !item.deleted &&
    item.responsibleId === userId &&
    item.nextDate &&
    !["won", "lost"].includes(item.stage) &&
    inPeriod(item.nextDate) &&
    (!user || user === userId) &&
    (!status || status === "planned") &&
    !plans.some(
      (plan) =>
        plan.status === "planned" &&
        plan.date === item.nextDate &&
        data.works.find((work) => work.id === plan.workId)?.crmOpportunityId ===
          item.id,
    );
  return (
    <>
      <div className="directory-intro">
        <div>
          <h2>Espaço para os próximos encontros.</h2>
          <p>
            Organize retornos e visitas quando fizer sentido para a sua rotina.
          </p>
        </div>
        <button className="button primary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} />
          Programar visita
        </button>
      </div>
      <section className="panel">
        <div className="schedule-filters">
          <div
            className="tabs"
            role="group"
            aria-label="Período da programação"
          >
            {[
              ["day", "Dia"],
              ["week", "Semana"],
              ["month", "Mês"],
            ].map(([id, name]) => (
              <button
                key={id}
                className={period === id ? "active" : ""}
                onClick={() => setPeriod(id)}
              >
                {name}
              </button>
            ))}
          </div>
          <Field
            label="Data de referência"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value || today())}
          />
          <Select label="Colaborador" value={user} onChange={setUser}>
            <option value="">Todos</option>
            {TEAM.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select label="Situação" value={status} onChange={setStatus}>
            <option value="">Todas</option>
            <option value="planned">Programadas</option>
            <option value="completed">Realizadas</option>
            <option value="cancelled">Não realizadas</option>
          </Select>
        </div>
        {plans.length ? (
          <div className="schedule-list">
            {plans.map((item) => {
              const work = data.works.find((work) => work.id === item.workId);
              return (
                <article className="schedule-item" key={item.id}>
                  <span className="date-tile">
                    <strong>{item.date.slice(8)}</strong>
                    <small>
                      {new Date(`${item.date}T12:00:00`).toLocaleDateString(
                        "pt-BR",
                        { month: "short" },
                      )}
                    </small>
                  </span>
                  <div className="schedule-info">
                    <strong>{item.workName}</strong>
                    <p>
                      {work?.neighborhood} · {person(item.userId)}
                    </p>
                    {item.notes && <small>{item.notes}</small>}
                    {item.reason && (
                      <small className="cancel-reason">
                        Motivo: {item.reason}
                      </small>
                    )}
                  </div>
                  <Badge
                    tone={
                      item.status === "completed"
                        ? "success"
                        : item.status === "cancelled"
                          ? "red"
                          : "blue"
                    }
                  >
                    {item.status === "completed"
                      ? "Realizada"
                      : item.status === "cancelled"
                        ? "Não realizada"
                        : item.date < today()
                          ? "Pendente"
                          : "Programada"}
                  </Badge>
                  {item.status === "planned" && (
                    <div className="schedule-actions">
                      <button
                        className="button secondary small"
                        onClick={() => onVisit(item)}
                      >
                        Registrar visita
                        <Icon name="arrow" size={15} />
                      </button>
                      <button
                        className="button text-button small"
                        onClick={() => setCancelling(item)}
                      >
                        Não realizada
                      </button>
                    </div>
                  )}
                  <button className="button text-button small" onClick={() => setDeleting(item)} aria-label={`Excluir programação de ${item.workName}`}>
                    Excluir
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title="Nenhuma visita programada neste período"
            description="A prospecção pode começar sem agendamento. Use a programação para os retornos que quiser organizar."
            icon="calendar"
            action={
              <button
                className="button secondary"
                onClick={() => setAdding(true)}
              >
                <Icon name="plus" size={17} />
                Programar visita
              </button>
            }
          />
        )}
      </section>
      {!!data.crm?.opportunities.some(isCrmReturn) && (
        <section className="panel crm-schedule-returns">
          <div className="panel-heading">
            <div>
              <h2>Retornos do CRM</h2>
              <p>
                Próximas ações atribuídas a {person(userId)}, no período
                selecionado.
              </p>
            </div>
            <Icon name="kanban" />
          </div>
          <div className="schedule-list">
            {data.crm.opportunities.filter(isCrmReturn).map((item) => (
              <article className="schedule-item" key={item.id}>
                <span className="date-tile">
                  <strong>{item.nextDate.slice(8)}</strong>
                  <small>{item.nextDate.slice(5, 7)}</small>
                </span>
                <div className="schedule-info">
                  <strong>{item.work.name}</strong>
                  <p>
                    {item.work.neighborhood} · {item.nextAction}
                  </p>
                </div>
                <Badge tone="blue">CRM</Badge>
                <button
                  className="button secondary small"
                  onClick={() => onVisit({ crmOpportunityId: item.id, userId })}
                >
                  Registrar visita
                  <Icon name="arrow" size={15} />
                </button>
                <button className="button text-button small" onClick={() => setDeletingCrmReturn(item)} aria-label={`Excluir retorno de ${item.work.name}`}>
                  Excluir retorno
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      {adding && (
        <PlanForm
          data={data}
          userId={userId}
          canAssign={canAssign}
          save={save}
          onClose={() => setAdding(false)}
        />
      )}
      {cancelling && (
        <CancelPlan
          plan={cancelling}
          save={save}
          onClose={() => setCancelling(null)}
        />
      )}
      {deleting && <DeleteRecord title="Excluir programação?" name={`${deleting.workName} · ${dateLabel(deleting.date)}`}
        description="Esta programação sairá da lista. Uma visita já realizada continuará no histórico."
        action={() => onDelete("plans", deleting.id)} onClose={() => setDeleting(null)} />}
      {deletingCrmReturn && <DeleteRecord title="Excluir retorno do CRM?" name={`${deletingCrmReturn.work.name} · ${dateLabel(deletingCrmReturn.nextDate)}`}
        description="O retorno sairá da programação. O cartão e seu histórico continuarão no CRM."
        action={() => onCrmAction(deletingCrmReturn.id, { type: "update", version: deletingCrmReturn.version,
          stage: deletingCrmReturn.stage, responsibleId: deletingCrmReturn.responsibleId,
          nextAction: "", nextDate: "", note: "" })} onClose={() => setDeletingCrmReturn(null)} />}
    </>
  );
}

function Ranking({ items, unit, onChoose, red = false }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className={`ranking ${red ? "red" : ""}`}>
      {items.map((item, index) => (
        <div className="ranking-item" key={item.key || item.name}>
          <div className="ranking-label">
            <span>
              <small>{String(index + 1).padStart(2, "0")}</small>
              {onChoose ? (
                <button onClick={() => onChoose(item)}>{item.name}</button>
              ) : (
                <b>{item.name}</b>
              )}
            </span>
            <strong>
              {item.value}
              <small> {unit}</small>
            </strong>
          </div>
          <div className="bar-track">
            <span style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
          {item.detail && <small className="muted">{item.detail}</small>}
        </div>
      ))}
    </div>
  );
}

export function Reports({ data, onDetail, team = TEAM }) {
  const defaults = {
    start: `${today().slice(0, 7)}-01`,
    end: today(),
    userId: "",
    contractorId: "",
    architectId: "",
    neighborhood: "",
    type: "",
    stage: "",
    product: "",
    outcome: "",
  };
  const [filters, setFilters] = useState(defaults);
  const [neighborhoodOrder, setNeighborhoodOrder] = useState("sales");
  const set = (key) => (value) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const visits = useMemo(
    () => filterVisits(data.visits, filters),
    [data.visits, filters],
  );
  const stats = summarize(visits, productNames(data));
  const visibleTeam = filters.userId
    ? team.filter((user) => user.id === filters.userId)
    : team;
  const indicators = teamIndicators(visits, visibleTeam);
  const neighborhoods = [
    ...new Set([
      ...data.visits.map((item) => item.neighborhood),
      ...(data.crm?.sales || [])
        .filter((sale) => team.some((user) => user.id === sale.sellerTeamId))
        .map((sale) => sale.work.neighborhood),
    ]),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const contacts = (role) =>
    data.contacts
      .filter((item) => item.role === role)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const invalidPeriod =
    filters.start && filters.end && filters.start > filters.end;
  const products = stats.products
    .filter((item) => item.offered > 0)
    .sort((a, b) => b.offered - a.offered);
  const rankedNeighborhoods = [...stats.neighborhoods].sort(
    (a, b) => b[neighborhoodOrder] - a[neighborhoodOrder],
  );
  const fullFilters = [
    filters.userId && `Colaborador: ${person(filters.userId)}`,
    filters.architectId &&
      `Arquiteto: ${data.contacts.find((item) => item.id === filters.architectId)?.name}`,
    filters.contractorId &&
      `Empreiteiro: ${data.contacts.find((item) => item.id === filters.contractorId)?.name}`,
    filters.neighborhood && `Bairro: ${filters.neighborhood}`,
    filters.type && `Obra: ${filters.type}`,
    filters.stage && `Tipo de visita: ${STAGES[filters.stage]}`,
    filters.product && `Produto: ${filters.product}`,
    filters.outcome &&
      `Resultado: ${filters.outcome === "sold" ? "Vendido" : "Interesse sem venda"}`,
  ].filter(Boolean);
  return (
    <div className="reports-page">
      <div className="print-heading">
        <img
          src={`${import.meta.env.BASE_URL}famac-logo.jpg`}
          alt="FAMAC Acabamentos"
        />
        <div>
          <h1>Relatório de visitação</h1>
          <p>
            {dateLabel(filters.start)} a {dateLabel(filters.end)} · Gerado em{" "}
            {dateLabel(today())}
          </p>
          <p>
            {fullFilters.join(" · ") ||
              "Todos os colaboradores, bairros, contatos e produtos"}
          </p>
        </div>
      </div>
      <div className="directory-intro">
        <div>
          <h2>Informação que abre oportunidades.</h2>
          <p>
            Entenda os produtos, os bairros e as conexões que movem seus
            resultados.
          </p>
        </div>
        <div className="button-row">
          <button
            className="button secondary"
            disabled={!visits.length || invalidPeriod}
            onClick={() =>
              downloadFile(
                visitsCsv(visits),
                `famac-visitas-${filters.start || "inicio"}-${filters.end || today()}.csv`,
                "text/csv;charset=utf-8",
              )
            }
          >
            <Icon name="download" size={17} />
            Exportar CSV
          </button>
          <button
            className="button primary"
            onClick={() => window.print()}
            disabled={invalidPeriod}
          >
            <Icon name="print" size={17} />
            Imprimir / PDF
          </button>
        </div>
      </div>
      <section className="panel report-filters">
        <div className="panel-heading">
          <div>
            <h2>
              <Icon name="search" size={18} />
              Encontre a visão que você precisa
            </h2>
            <p>Combine os filtros para analisar suas visitas.</p>
          </div>
          <button
            className="button text-button"
            onClick={() => setFilters({ ...defaults, start: "", end: "" })}
          >
            Limpar filtros
          </button>
        </div>
        <div className="fields report-filter-grid">
          <Field
            label="De"
            type="date"
            value={filters.start}
            onChange={(event) => set("start")(event.target.value)}
          />
          <Field
            label="Até"
            type="date"
            value={filters.end}
            onChange={(event) => set("end")(event.target.value)}
          />
          <Select
            label="Colaborador"
            value={filters.userId}
            onChange={set("userId")}
          >
            <option value="">Todos os colaboradores</option>
            {team.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select
            label="Bairro"
            value={filters.neighborhood}
            onChange={set("neighborhood")}
          >
            <option value="">Todos os bairros</option>
            {neighborhoods.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </Select>
          <Select
            label="Arquiteto"
            value={filters.architectId}
            onChange={set("architectId")}
          >
            <option value="">Todos os arquitetos</option>
            {contacts("architect").map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select
            label="Empreiteiro"
            value={filters.contractorId}
            onChange={set("contractorId")}
          >
            <option value="">Todos os empreiteiros</option>
            {contacts("contractor").map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select
            label="Produto"
            value={filters.product}
            onChange={set("product")}
          >
            <option value="">Todos os produtos</option>
            {summarize(data.visits, [
              ...productNames(data),
              ...(data.crm?.sales || []).flatMap((sale) => sale.products),
            ]).products.map(({ name }) => (
              <option key={name}>{name}</option>
            ))}
          </Select>
          <Select
            label="Resultado do produto"
            value={filters.outcome}
            onChange={set("outcome")}
          >
            <option value="">Oferecido ou vendido</option>
            <option value="interest">Interesse sem venda</option>
            <option value="sold">Vendido</option>
          </Select>
          <Select
            label="Tipo de obra"
            value={filters.type}
            onChange={set("type")}
          >
            <option value="">Todos os tipos</option>
            <option>Residencial</option>
            <option>Comercial</option>
          </Select>
          <Select
            label="Tipo de visita"
            value={filters.stage}
            onChange={set("stage")}
          >
            <option value="">Todos os tipos de visita</option>
            {Object.entries(STAGES).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
        </div>
        {invalidPeriod && (
          <p className="error" role="alert">
            A data inicial deve ser anterior ou igual à data final.
          </p>
        )}
      </section>
      <div className="report-period">
        <span>
          <i className="dot offered" />
          {visits.length} visitas no período selecionado
        </span>
        <small>
          {filters.start ? dateLabel(filters.start) : "Desde o início"} —{" "}
          {filters.end ? dateLabel(filters.end) : "Todas as datas"}
        </small>
      </div>
      <div className="metrics">
        <Metric
          label="Visitas realizadas"
          value={stats.visits}
          detail={`${stats.works} obras diferentes`}
          icon="visit"
        />
        <Metric
          label="Visitas de prospecção"
          value={stats.prospecting}
          detail="Visitas classificadas como prospecção"
          icon="search"
        />
        <Metric
          label="Visitas com venda"
          value={stats.sales}
          detail={`${stats.conversion}% das visitas filtradas`}
          icon="trend"
        />
        <Metric
          label="Valor das visitas filtradas"
          value={money(stats.value)}
          detail="Total da visita, incluindo todos os produtos"
          icon="chart"
          accent
        />
      </div>
      <ReportOverview visits={visits} stats={stats} filters={filters} />
      <CrmSalesReport data={data} filters={filters} team={team} />
      <div className="report-charts">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">PORTFÓLIO EM MOVIMENTO</span>
              <h2>Interesse e vendas por produto</h2>
              <p>Cada contagem representa uma visita com o produto.</p>
            </div>
            <Icon name="box" />
          </div>
          {products.length ? (
            <>
              <div className="chart-legend">
                <span>
                  <i className="dot offered" />
                  Interesse sem venda
                </span>
                <span>
                  <i className="dot sold" />
                  Vendido
                </span>
              </div>
              <div className="product-chart">
                {products.map((item) => {
                  const max = Math.max(
                    1,
                    ...products.map((product) => product.offered),
                  );
                  return (
                    <div className="product-chart-row" key={item.name}>
                      <button
                        title={`Filtrar ${item.name}`}
                        onClick={() => set("product")(item.name)}
                      >
                        {item.name}
                      </button>
                      <div>
                        <span
                          className="interest-bar"
                          style={{ width: `${(item.interest / max) * 100}%` }}
                        />
                        <span
                          className="sold-bar"
                          style={{ width: `${(item.sold / max) * 100}%` }}
                        />
                      </div>
                      <strong
                        title={`${item.interest} interesses sem venda e ${item.sold} vendas`}
                      >
                        {item.interest}
                        <span> / </span>
                        {item.sold}
                      </strong>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <Empty
              title="Qual será o próximo destaque?"
              description="Os produtos oferecidos e vendidos aparecerão aqui após os registros."
              icon="box"
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">ONDE ESTÃO AS OPORTUNIDADES</span>
              <h2>Bairros em destaque</h2>
              <p>Descubra onde sua presença traz mais resultados.</p>
            </div>
            <Icon name="visit" />
          </div>
          <div
            className="tabs compact"
            role="group"
            aria-label="Ordenar bairros"
          >
            {[
              ["sales", "Vendas"],
              ["interest", "Interesse"],
              ["visits", "Visitas"],
            ].map(([id, name]) => (
              <button
                key={id}
                className={neighborhoodOrder === id ? "active" : ""}
                onClick={() => setNeighborhoodOrder(id)}
              >
                {name}
              </button>
            ))}
          </div>
          {rankedNeighborhoods.length ? (
            <Ranking
              items={rankedNeighborhoods.slice(0, 8).map((item) => ({
                ...item,
                value: item[neighborhoodOrder],
                detail: `${item.city} · ${item.visits} visitas · ${item.sales} com venda · ${money(item.value)}`,
              }))}
              unit="visitas"
              onChoose={(item) => set("neighborhood")(item.name)}
              red={neighborhoodOrder === "sales"}
            />
          ) : (
            <Empty
              title="Seu alcance, bairro a bairro"
              description="O bairro de cada obra vai mostrar onde estão as vendas e os interesses."
              icon="visit"
            />
          )}
        </section>
      </div>
      <section className="panel team-report">
        <div className="panel-heading">
          <div>
            <h2>Presença de cada colaborador</h2>
            <p>Visitas, dias em campo e resultados no período filtrado.</p>
          </div>
          <Icon name="users" />
        </div>
        <TeamKpis rows={indicators} onChoose={set("userId")} />
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Visitas</th>
                <th>Prospecções</th>
                <th>Visitas com venda</th>
                <th>Conversão</th>
                <th>Valor total</th>
              </tr>
            </thead>
            <tbody>
              {visibleTeam.map((user) => {
                const result = indicators.find((item) => item.id === user.id);
                return (
                  <tr key={user.id}>
                    <td>
                      <button
                        className="table-link"
                        onClick={() => set("userId")(user.id)}
                      >
                        {user.name}
                      </button>
                    </td>
                    <td>{result.visits}</td>
                    <td>{result.prospecting}</td>
                    <td>{result.sales}</td>
                    <td>{result.conversion.toLocaleString("pt-BR")}%</td>
                    <td>{money(result.value)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel report-visits">
        <div className="panel-heading">
          <div>
            <h2>Visitas que compõem este relatório</h2>
            <p>Consulte os detalhes de cada contato e de cada obra.</p>
          </div>
          <Badge>{visits.length} registros</Badge>
        </div>
        <div className="screen-only">
          <VisitsTable visits={visits} onDetail={onDetail} />
        </div>
        <table className="print-visits">
          <thead>
            <tr>
              <th>Data / colaborador</th>
              <th>Obra / bairro / contatos</th>
              <th>Oferecidos</th>
              <th>Vendidos / valor</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((item) => (
              <tr key={item.id}>
                <td>
                  {dateLabel(item.date)}
                  <br />
                  {person(item.userId)}
                  <br />
                  {STAGES[item.stage]}
                </td>
                <td>
                  {item.workName}
                  <br />
                  {item.neighborhood}, {item.city}/{item.state}
                  <br />
                  Empreiteiro: {item.contractorName || "—"}
                  <br />
                  Arquiteto: {item.architectName || "—"}
                </td>
                <td>{item.offered.join(", ")}</td>
                <td>
                  {item.sold.join(", ") || "Sem venda"}
                  <br />
                  {money(item.saleValue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="report-footnote">
        <Icon name="info" size={15} />
        <span>
          Interesse = produto oferecido sem venda na mesma visita. Venda =
          visita com pelo menos um produto marcado como vendido. Valores são
          totais por visita, sem divisão por produto.
        </span>
      </p>
    </div>
  );
}

export function Catalog({ data, save, canManage = false }) {
  const stats = summarize(data.visits, productNames(data));
  const items = catalogProducts(data);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [presenting, setPresenting] = useState(null);
  return (
    <>
      <div className="catalog-banner">
        <span className="eyebrow">O ACABAMENTO FAZ A DIFERENÇA</span>
        <h2>Possibilidades para cada ambiente.</h2>
        <p>
          {items.length} produtos da FAMAC, prontos para fazer parte da próxima
          visita.
        </p>
      </div>
      {canManage && (
        <div className="catalog-actions">
          <button className="button primary" onClick={() => setEditing({})}>
            <Icon name="plus" size={18} />
            Novo produto
          </button>
        </div>
      )}
      <div className="catalog-grid">
        {items.map((item, index) => {
          const count = stats.products.find((row) => row.name === item.name);
          return (
            <article className="catalog-card" key={item.id}>
              <div>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <Icon name="box" size={24} />
              </div>
              {!!item.photos?.length && (
                <div
                  className="product-cover"
                  role="group"
                  aria-label={`Fotos de ${item.name}`}
                >
                  <ProductImage
                    photo={item.photos[0]}
                    alt={`Capa de ${item.name}`}
                    retry={false}
                  />
                  <button
                    type="button"
                    className="product-cover-open"
                    aria-label={`Ver fotos de ${item.name}`}
                    onClick={() => setPresenting(item)}
                  >
                    <span className="product-cover-count">
                      <Icon name="camera" size={15} />
                      Ver{" "}
                      {item.photos.length === 1
                        ? "foto"
                        : `${item.photos.length} fotos`}
                    </span>
                  </button>
                </div>
              )}
              <h3>{item.name}</h3>
              <p>
                <strong>{count.offered}</strong> visitas com oferta{" "}
                <span>·</span> <strong>{count.sold}</strong> com venda
              </p>
              {canManage && (
                <footer className="product-record-actions">
                  <button
                    className="button secondary"
                    aria-label={`Editar ${item.name}`}
                    onClick={() => setEditing(item)}
                  >
                    <Icon name="edit" size={16} />
                    Editar
                  </button>
                  <button
                    className="button secondary delete-action"
                    aria-label={`Excluir ${item.name}`}
                    onClick={() => setDeleting(item)}
                  >
                    <Icon name="trash" size={16} />
                    Excluir
                  </button>
                </footer>
              )}
            </article>
          );
        })}
      </div>
      {!items.length && (
        <Empty
          title="Nenhum produto no catálogo"
          description="Cadastre um produto para disponibilizá-lo nas próximas visitas."
          icon="box"
        />
      )}
      {editing && (
        <ProductForm
          initial={editing.id ? editing : undefined}
          data={data}
          save={save}
          onClose={() => setEditing(null)}
        />
      )}
      {presenting && (
        <ProductGallery
          product={presenting}
          onClose={() => setPresenting(null)}
        />
      )}
      {deleting && (
        <DeleteRecord
          title="Excluir produto?"
          name={deleting.name}
          description="O produto deixará de aparecer nas próximas visitas. Ofertas, vendas e relatórios já registrados continuarão com o nome original."
          save={save}
          update={(current) =>
            saveProduct(current, { ...deleting, deleted: true })
          }
          message="Produto excluído do catálogo."
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

function ProductForm({ initial, data, save, onClose }) {
  const [name, setName] = useState(initial?.name || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [photos, setPhotos] = useState(initial?.photos || []);
  const [photoBusy, setPhotoBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    const clean = productName(name);
    if (!clean || clean.length > 80)
      return setError("Informe um nome de até 80 caracteres.");
    if (
      catalogProducts(data).some(
        (item) =>
          item.id !== initial?.id &&
          productKey(item.name) === productKey(clean),
      )
    )
      return setError("Já existe um produto com esse nome.");
    setBusy(true);
    setError("");
    try {
      await save(
        (current) =>
          saveProduct(current, {
            id: initial?.id || uid(),
            name: clean,
            photos,
          }),
        initial
          ? "Produto atualizado."
          : "Produto cadastrado e disponível nas visitas.",
      );
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={initial ? "Editar produto" : "Novo produto"}
      onClose={busy || photoBusy ? () => {} : onClose}
    >
      <form onSubmit={submit}>
        <Field
          label="Nome do produto"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={80}
          autoFocus
          hint={
            initial
              ? "O novo nome será usado nas próximas visitas. O histórico manterá o nome registrado na época."
              : "Disponível para toda a equipe nas próximas visitas."
          }
        />
        <ProductPhotoEditor
          photos={photos}
          onChange={setPhotos}
          onBusy={setPhotoBusy}
          disabled={busy}
        />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-actions">
          <button
            type="button"
            className="button secondary"
            onClick={onClose}
            disabled={busy || photoBusy}
          >
            Cancelar
          </button>
          <button className="button primary" disabled={busy || photoBusy}>
            {busy
              ? "Salvando…"
              : initial
                ? "Salvar produto"
                : "Cadastrar produto"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function DeleteRecord({
  title,
  name,
  description,
  save,
  update,
  action,
  message,
  onClose,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (action) await action();
      else await save(update, message);
      onClose();
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit}>
        <p className="delete-record-name">{name}</p>
        <p>{description}</p>
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
          <button className="button primary" disabled={busy}>
            {busy ? "Excluindo…" : "Confirmar exclusão"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export function Team({ data, userId, onUserChange, account }) {
  return (
    <>
      <div className="directory-intro">
        <div>
          <h2>Quem faz as conexões acontecerem.</h2>
          <p>A equipe de visitação da FAMAC.</p>
        </div>
      </div>
      <div className="team-grid">
        {TEAM.map((item) => {
          const visits = data.visits.filter(
            (visit) => visit.userId === item.id,
          );
          return (
            <article className="panel team-card" key={item.id}>
              <span className="large-avatar">{item.initials}</span>
              <h2>{item.name}</h2>
              <Badge tone="blue">Visitação e prospecção</Badge>
              <div className="work-stats">
                <span>
                  <b>{visits.length}</b> visitas
                </span>
                <span>
                  <b>{visits.filter((visit) => visit.sold.length).length}</b>{" "}
                  com venda
                </span>
              </div>
              <button
                className={`button ${userId === item.id ? "secondary" : "primary"}`}
                onClick={() => onUserChange(item.id)}
                disabled={userId === item.id}
              >
                {userId === item.id
                  ? "Perfil selecionado"
                  : account
                    ? "Selecionar colaborador"
                    : "Usar na prévia"}
              </button>
            </article>
          );
        })}
      </div>
      <div className="notice team-notice">
        <Icon name="info" />
        <p>
          {account
            ? "Cada colaborador acessa seus próprios registros com PIN e senha. A administração pode acompanhar os resultados de toda a equipe."
            : "Esta é uma prévia local. A seleção de colaborador serve para revisar os fluxos e atribuir registros; não é um login. As contas, senhas e permissões serão configuradas com o banco definitivo."}
        </p>
      </div>
      {account && <AccessManagement account={account} />}
    </>
  );
}

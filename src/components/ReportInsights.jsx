import React, { useId, useState } from "react";
import { dateLabel, money } from "../lib/domain.mjs";
import { activitySeries } from "../lib/reporting.mjs";
import { Icon, Empty } from "./ui.jsx";
import "../reports.css";

const percent = (value) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value);
export function KpiRing({ value, label, muted = false }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div
      className={`kpi-ring ${muted ? "muted-ring" : ""}`}
      role="img"
      aria-label={`${label}: ${percent(safe)}%`}
    >
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="ring-track" cx="60" cy="60" r="50" />
        <circle
          className="ring-value"
          cx="60"
          cy="60"
          r="50"
          pathLength="100"
          strokeDasharray={`${safe} 100`}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <span>
        <strong>
          {percent(safe)}
          <small>%</small>
        </strong>
        <small>{label}</small>
      </span>
    </div>
  );
}

function ActivityChart({ bins, term = "visitas" }) {
  const id = useId().replaceAll(":", "");
  const [active, setActive] = useState(null);
  if (!bins.length)
    return (
      <Empty
        title="O próximo movimento começa em campo"
        description={`Registre ${term} para acompanhar a evolução do período.`}
        icon="trend"
      />
    );
  const width = 680,
    height = 235,
    left = 34,
    right = 18,
    top = 20,
    bottom = 34;
  const max = Math.max(
    3,
    Math.ceil(Math.max(...bins.map((bin) => bin.visits)) / 3) * 3,
  );
  const x = (index) =>
    bins.length === 1
      ? width / 2
      : left + (index * (width - left - right)) / (bins.length - 1);
  const y = (value) =>
    height - bottom - (value / max) * (height - top - bottom);
  const line = (key) =>
    bins.map((bin, index) => `${x(index)},${y(bin[key])}`).join(" ");
  const selection = active === null ? null : bins[active];
  return (
    <div className="activity-chart">
      <div className="activity-chart-legend">
        <span>
          <i />
          {term === "leads" ? "Leads recebidos" : term === "contatos" ? "Contatos registrados" : "Visitas realizadas"}
        </span>
        <span>
          <i />
          {term === "leads" ? "Leads com venda" : term === "contatos" ? "Contatos com venda" : "Visitas com venda"}
        </span>
      </div>
      <div className="activity-plot">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`Evolução dos ${term} e dos registros com venda por intervalo de datas`}
        >
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#354c7d" stopOpacity=".2" />
              <stop offset="1" stopColor="#354c7d" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map((step) => (
            <g key={step}>
              <line
                x1={left}
                x2={width - right}
                y1={y((step * max) / 3)}
                y2={y((step * max) / 3)}
                className="plot-grid"
              />
              <text x={left - 10} y={y((step * max) / 3) + 4} textAnchor="end">
                {(step * max) / 3}
              </text>
            </g>
          ))}
          <polygon
            points={`${x(0)},${y(0)} ${line("visits")} ${x(bins.length - 1)},${y(0)}`}
            fill={`url(#${id})`}
          />
          <polyline points={line("visits")} className="visits-line" />
          <polyline points={line("sales")} className="sales-line" />
          {bins.map((bin, index) => (
            <g
              key={bin.date}
              className={`plot-point ${index === 0 || index === bins.length - 1 ? "endpoint" : ""}`}
            >
              <circle
                cx={x(index)}
                cy={y(bin.visits)}
                r={active === index ? 6 : 4}
                className="visit-dot"
              />
              <circle
                cx={x(index)}
                cy={y(bin.sales)}
                r="3"
                className="sale-dot"
              />
              {(bins.length <= 6 ||
                index % 2 === 0 ||
                index === bins.length - 1) && (
                <text x={x(index)} y={height - 9} textAnchor="middle">
                  {dateLabel(bin.date).slice(0, 5)}
                </text>
              )}
              <rect
                x={
                  x(index) -
                  Math.min(
                    24,
                    (width - left - right) / Math.max(1, bins.length) / 2,
                  )
                }
                y={top - 5}
                width={Math.min(
                  48,
                  (width - left - right) / Math.max(1, bins.length),
                )}
                height={height - top - bottom + 10}
                fill="transparent"
                tabIndex="0"
                role="button"
                aria-label={`${dateLabel(bin.date)} a ${dateLabel(bin.endDate)}: ${bin.visits} ${term}, ${bin.sales} com venda`}
                onPointerEnter={() => setActive(index)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(index)}
                onKeyDown={(event) => {
                  if (["Enter", " "].includes(event.key)) {
                    event.preventDefault();
                    setActive(index);
                  }
                }}
              >
                <title>{`${dateLabel(bin.date)} a ${dateLabel(bin.endDate)}: ${bin.visits} ${term}, ${bin.sales} com venda`}</title>
              </rect>
            </g>
          ))}
        </svg>
      </div>
      <div className="activity-chart-note" aria-live="polite">
        {selection ? (
          <>
            <strong>
              {dateLabel(selection.date)}
              {selection.date !== selection.endDate &&
                ` a ${dateLabel(selection.endDate)}`}
            </strong>
            <span>
              {selection.visits} {term} · {selection.sales} com venda
            </span>
          </>
        ) : (
          <>
            <span>Passe o cursor ou toque nos pontos para ver os valores.</span>
            <small>Até 12 intervalos no período</small>
          </>
        )}
      </div>
    </div>
  );
}

export function ReportOverview({ visits, stats, filters }) {
  const series = activitySeries(visits, filters.start, filters.end);
  const term = filters.source === "lead" ? "leads" : filters.source === "visit" ? "visitas" : "contatos";
  return (
    <div className="report-insights">
      <section className="panel report-evolution">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">RITMO DA OPERAÇÃO</span>
            <h2>Evolução {term === "visitas" ? "das visitas" : `dos ${term}`}</h2>
            <p>Como a atividade e os fechamentos se distribuem no período.</p>
          </div>
          <Icon name="trend" />
        </div>
        <ActivityChart bins={series} term={term} />
      </section>
      <section className="conversion-panel">
        <span className="eyebrow">EFICIÊNCIA COMERCIAL</span>
        <h2>{term === "visitas" ? "Da visita à venda." : term === "leads" ? "Do lead à venda." : "Do contato à venda."}</h2>
        <KpiRing
          value={stats.conversion}
          label="conversão"
          muted={!visits.length}
        />
        <div className="conversion-counts">
          <div>
            <strong>{stats.sales}</strong>
            <span>com venda</span>
          </div>
          <div>
            <strong>{stats.visits - stats.sales}</strong>
            <span>sem venda</span>
          </div>
        </div>
        <div className="average-ticket">
          <span>Valor médio por {term === "visitas" ? "visita" : term === "leads" ? "lead" : "contato"} com venda</span>
          <strong>
            {stats.sales ? money(stats.value / stats.sales) : "—"}
          </strong>
        </div>
        <p>
          {stats.visits
            ? `${term[0].toUpperCase()}${term.slice(1)} com venda ÷ ${term} do período.`
            : "Os indicadores aparecem com os primeiros registros."}
        </p>
      </section>
    </div>
  );
}

export function TeamKpis({ rows, onChoose, source = "visit" }) {
  const term = source === "lead" ? "leads" : source === "visit" ? "visitas" : "contatos";
  return (
    <div className="team-kpis">
      {rows.map((row) => (
        <article className="team-kpi" key={row.id}>
          <div className="team-kpi-header">
            <span className="team-kpi-avatar">{row.initials}</span>
            <div>
              <button className="table-link" onClick={() => onChoose(row.id)}>
                {row.name}
              </button>
              <span>Atividade no período</span>
            </div>
            <Icon name="users" size={18} />
          </div>
          <div className="team-kpi-main">
            <div>
              <strong>{row.visits}</strong>
              <span>{term === "visitas" ? "visitas realizadas" : term === "leads" ? "leads recebidos" : "contatos registrados"}</span>
            </div>
            <KpiRing
              value={row.conversion}
              label="conversão"
              muted={!row.visits}
            />
          </div>
          <div className="team-share">
            <span>
              Participação {term === "visitas" ? "nas" : "nos"} {term} <b>{percent(row.share)}%</b>
            </span>
            <div>
              <i style={{ width: `${row.share}%` }} />
            </div>
          </div>
          <dl>
            <div>
              <dt>Dias com {source === "lead" ? "contato" : source === "visit" ? "visita" : "registro"}</dt>
              <dd>{row.days}</dd>
            </div>
            <div>
              <dt>Com venda</dt>
              <dd>{row.sales}</dd>
            </div>
            <div>
              <dt>Valor vendido</dt>
              <dd>{money(row.value)}</dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  );
}

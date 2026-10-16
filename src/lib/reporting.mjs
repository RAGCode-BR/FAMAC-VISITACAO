import { TEAM } from "./domain.mjs";

const ratio = (part, total) =>
  total ? Math.round((part / total) * 1000) / 10 : 0;
export function teamIndicators(visits, team = TEAM) {
  return team.map((user) => {
    const rows = visits.filter((visit) => visit.userId === user.id);
    const sales = rows.filter((visit) => visit.sold.length);
    return {
      ...user,
      visits: rows.length,
      days: new Set(rows.map((visit) => visit.date)).size,
      sales: sales.length,
      prospecting: rows.filter((visit) => visit.stage === "prospecting").length,
      conversion: ratio(sales.length, rows.length),
      share: ratio(rows.length, visits.length),
      value: sales.reduce(
        (total, visit) => total + (Number(visit.saleValue) || 0),
        0,
      ),
    };
  });
}

// Até doze intervalos, incluindo os períodos sem visita, sem criar séries fictícias.
export function activitySeries(visits, start, end) {
  const dates = visits.map((visit) => visit.date).sort();
  const first = start || dates[0],
    last = end || dates.at(-1);
  const day = (value) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value || "")
      ? Date.parse(`${value}T00:00:00Z`) / 86400000
      : NaN;
  const from = day(first),
    to = day(last);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return [];
  const span = to - from + 1,
    width = Math.ceil(span / 12);
  const iso = (value) => new Date(value * 86400000).toISOString().slice(0, 10);
  const bins = Array.from({ length: Math.ceil(span / width) }, (_, index) => ({
    date: iso(from + index * width),
    endDate: iso(Math.min(to, from + (index + 1) * width - 1)),
    visits: 0,
    sales: 0,
  }));
  for (const visit of visits) {
    const position = day(visit.date);
    if (position < from || position > to || !Number.isFinite(position))
      continue;
    const bin = bins[Math.floor((position - from) / width)];
    bin.visits++;
    if (visit.sold.length) bin.sales++;
  }
  return bins;
}

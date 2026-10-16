import { createHash } from "node:crypto";

export const normalizeContact = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
const clean = (value) =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ");
const cityName = (value) =>
  normalizeContact(value) === "N. UBIRATA" ? "NOVA UBIRATA" : clean(value);
const phoneKey = (value) => String(value || "").replace(/\D/g, "");
export const architectKey = (contact) =>
  [
    normalizeContact(contact.name),
    phoneKey(contact.phone),
    normalizeContact(cityName(contact.city)),
  ].join("|");
function stableId(key) {
  const hex = createHash("sha256")
    .update(`famac-architects-v1|${key}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export function planArchitects(rows, { excludeNames = [] } = {}) {
  const companyNames = new Set(excludeNames.map(normalizeContact));
  const groups = new Map();
  const excluded = [];
  const seen = new Set();
  let duplicates = 0;
  for (const row of rows) {
    if (!clean(row.name)) continue;
    const key = `${architectKey(row)}|${normalizeContact(row.profession)}`;
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    let reason;
    if (!/^ARQUITET[OA]S?$/.test(normalizeContact(row.profession)))
      reason = "Cargo diferente de arquiteto";
    else if (
      /\b(ENG|ENGENHEIR[OA]|ENGENHARIA|CONSTRUTORA|CONSTRUCOES|LTDA)\b/.test(
        normalizeContact(row.name),
      )
    )
      reason =
        "Nome menciona engenharia, construtora ou empresa; revisar profissão";
    else if (companyNames.has(normalizeContact(row.name)))
      reason = "Identificação aparente de empresa, sem nome de arquiteto";
    if (reason) {
      excluded.push({ ...row, reason });
      continue;
    }
    const groupKey = normalizeContact(row.name);
    const group = groups.get(groupKey) || [];
    group.push({ ...row, city: cityName(row.city) });
    groups.set(groupKey, group);
  }
  const contacts = [];
  for (const group of groups.values()) {
    const phones = new Set(group.map((r) => phoneKey(r.phone)).filter(Boolean));
    const cities = new Set(
      group.map((r) => normalizeContact(r.city)).filter(Boolean),
    );
    if (phones.size > 1 || cities.size > 1) {
      excluded.push(
        ...group.map((row) => ({
          ...row,
          reason:
            "Mesmo nome com telefones ou cidades diferentes; revisar antes de unir",
        })),
      );
      continue;
    }
    const contact = {
      name: clean(group[0].name),
      role: "architect",
      phone: clean(group.find((r) => phoneKey(r.phone))?.phone),
      city: clean(group.find((r) => r.city)?.city),
      company: "",
      notes: "",
    };
    contact.id = stableId(architectKey(contact));
    contacts.push(contact);
    duplicates += group.length - 1;
  }
  contacts.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { contacts, excluded, duplicates, sourceRows: rows.length };
}

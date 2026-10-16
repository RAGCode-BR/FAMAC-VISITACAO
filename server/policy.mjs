import { TEAM, validateVisit } from "../src/lib/domain.mjs";
import { isSharedContact } from "../src/lib/contacts.mjs";

export const collections = ["contacts", "works", "visits", "plans"];
export const validId = (id) =>
  typeof id === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
export function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}
export function requireOwner(member, ownerId) {
  if (!TEAM.some((item) => item.id === ownerId)) fail("Colaborador inválido.");
  if (member.role !== "admin" && member.teamId !== ownerId)
    fail("Você só pode acessar seus próprios registros.", 403);
}
export function requireContactWrite(member, ownerId, previous, next) {
  if (isSharedContact(previous) && isSharedContact(next)) return;
  requireOwner(member, ownerId);
}
export function validateState(state) {
  if (!state || state.version !== 1) fail("Formato de dados inválido.");
  for (const kind of collections) {
    if (!Array.isArray(state[kind])) fail("Formato de dados inválido.");
    const ids = new Set();
    for (const record of state[kind]) {
      if (!record || !validId(record.id) || ids.has(record.id))
        fail("Identificação de registro inválida.");
      ids.add(record.id);
      if (JSON.stringify(record).length > 100_000)
        fail("Registro muito grande.");
    }
  }
}
export function validateRecord(kind, record) {
  if (kind === "contacts") {
    if (
      typeof record.name !== "string" ||
      !record.name.trim() ||
      record.name.length > 180 ||
      !["architect", "contractor", "responsible"].includes(record.role)
    )
      fail("Informe nome e função válidos para o contato.");
  } else if (kind === "works") {
    for (const field of ["name", "street", "neighborhood", "city"])
      if (
        typeof record[field] !== "string" ||
        !record[field].trim() ||
        record[field].length > 180
      )
        fail("Preencha nome, rua, bairro e cidade da obra.");
    if (
      !["Comercial", "Residencial"].includes(record.type) ||
      !/^[A-Z]{2}$/.test(record.state)
    )
      fail("Tipo de obra ou UF inválida.");
  } else if (kind === "visits") {
    for (const field of [
      "workName",
      "date",
      "userId",
      "street",
      "neighborhood",
      "city",
      "state",
      "phone",
    ])
      if (typeof record[field] !== "string")
        fail("Preencha os dados da visita no formato correto.");
    if (!Array.isArray(record.offered) || !Array.isArray(record.sold))
      fail("Seleção de produtos inválida.");
    try {
      validateVisit(record);
    } catch (error) {
      fail(error.message);
    }
    if (
      !validId(record.workId) ||
      !Array.isArray(record.photos) ||
      record.photos.length > 6
    )
      fail("Obra ou fotos inválidas.");
    if (record.sold.length && record.stage !== "closing")
      fail("Uma venda deve ser registrada como fechamento.");
  } else if (kind === "plans") {
    if (
      !validId(record.workId) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(record.date) ||
      !["planned", "completed", "cancelled"].includes(record.status)
    )
      fail("Programação inválida.");
  }
}

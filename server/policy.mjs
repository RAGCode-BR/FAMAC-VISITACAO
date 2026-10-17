import {
  TEAM,
  PRODUCTS,
  productKey,
  productName,
  catalogProducts,
  validateVisit,
} from "../src/lib/domain.mjs";
import { isSharedContact } from "../src/lib/contacts.mjs";
import { MAX_PRODUCT_PHOTOS } from "../src/lib/photo.mjs";

export const collections = ["products", "contacts", "works", "visits", "plans"];
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
export function requireCatalogAdmin(member) {
  if (member.role !== "admin")
    fail("Somente a administração pode gerenciar produtos.", 403);
}
export function requireContactWrite(member, ownerId, previous, next) {
  if (isSharedContact(previous) && isSharedContact(next)) return;
  requireOwner(member, ownerId);
}
export function validateState(state) {
  if (!state || state.version !== 1) fail("Formato de dados inválido.");
  for (const kind of collections) {
    // Compatibilidade com versões anteriores do navegador e da prévia local.
    if (kind === "products" && state.products === undefined) continue;
    if (!Array.isArray(state[kind])) fail("Formato de dados inválido.");
    const ids = new Set();
    for (const record of state[kind]) {
      if (!record || !validId(record.id) || ids.has(record.id))
        fail("Identificação de registro inválida.");
      ids.add(record.id);
      if (JSON.stringify(record).length > 100_000)
        fail("Registro muito grande.");
    }
    if (kind === "products") {
      const keys = catalogProducts(state).map((item) => productKey(item.name));
      if (new Set(keys).size !== keys.length)
        fail("Há produtos com nomes repetidos.");
    }
  }
}
export function validateRecord(kind, record, allowedProducts = PRODUCTS) {
  if (
    record.deleted !== undefined &&
    (typeof record.deleted !== "boolean" ||
      !["products", "contacts"].includes(kind))
  )
    fail("Exclusão inválida.");
  if (kind === "products") {
    if (
      typeof record.name !== "string" ||
      !record.name.trim() ||
      record.name.length > 80 ||
      record.name !== productName(record.name)
    )
      fail("Informe um nome de produto válido, de até 80 caracteres.");
    if (
      record.photos !== undefined &&
      (!Array.isArray(record.photos) ||
        record.photos.length > MAX_PRODUCT_PHOTOS ||
        record.photos.some(
          (photo) =>
            !photo ||
            !validId(photo.id) ||
            photo.scope !== "product" ||
            photo.url !== undefined,
        ) ||
        new Set(record.photos.map((photo) => photo.id)).size !==
          record.photos.length)
    )
      fail("Fotos do produto inválidas. Adicione no máximo 6 fotos.");
  } else if (kind === "contacts") {
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
    if (
      (record.crmEnabled !== undefined &&
        typeof record.crmEnabled !== "boolean") ||
      (record.crmOpportunityId && !validId(record.crmOpportunityId)) ||
      (record.crmSaleId && !validId(record.crmSaleId))
    )
      fail("Vínculo com o CRM inválido.");
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
      validateVisit(record, allowedProducts);
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

export function requireCatalogChange(previous, next) {
  if (previous?.deleted)
    fail("Este cadastro já foi excluído. Atualize a página.", 409);
  // A exclusão altera apenas a disponibilidade e mantém os dados vinculados.
  if (next.deleted && previous) {
    const { ownerId: _owner, deleted: _deleted, ...record } = next;
    const { ownerId: _oldOwner, deleted: _oldDeleted, ...original } = previous;
    if (
      JSON.stringify(Object.entries(record).sort()) !==
      JSON.stringify(Object.entries(original).sort())
    )
      fail("Exclua o cadastro sem alterar seus dados.");
  }
}

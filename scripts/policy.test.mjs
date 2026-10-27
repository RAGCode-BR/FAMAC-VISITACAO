import test from "node:test";
import assert from "node:assert/strict";
import {
  requireOwner,
  requireContactWrite,
  validateState,
  validateRecord,
  requireCatalogAdmin,
  requireCatalogChange,
} from "../server/policy.mjs";
import { pinIdentity } from "../src/lib/identity.mjs";
import { DEFAULT_PRODUCTS, emptyData } from "../src/lib/domain.mjs";

test("PIN de um dígito preserva as contas existentes e aceita o zero", () => {
  assert.equal(pinIdentity("0"), "pin-900001@login.famac.invalid");
  assert.equal(pinIdentity("1"), "pin-100001@login.famac.invalid");
  assert.equal(pinIdentity("2"), "pin-100002@login.famac.invalid");
  assert.equal(pinIdentity("3"), "pin-100003@login.famac.invalid");
  assert.equal(
    new Set(Array.from({ length: 10 }, (_, n) => pinIdentity(String(n)))).size,
    10,
  );
  for (const pin of [
    "",
    "01",
    "100001",
    "900001",
    "charles",
    "../1",
    " 0",
    0,
    null,
  ])
    assert.throws(() => pinIdentity(pin));
});
test("somente a administração pode operar em nome de outro colaborador", () => {
  const member = { role: "collaborator", teamId: "charles" };
  assert.doesNotThrow(() => requireOwner(member, "charles"));
  assert.throws(() => requireOwner(member, "celso"), { status: 403 });
  assert.doesNotThrow(() => requireOwner({ role: "admin" }, "celso"));
  assert.doesNotThrow(() => requireOwner({ role: "supervisor", teamId: "tulio" }, "celso"));
  assert.throws(() => requireOwner({ role: "admin" }, "qualquer-pessoa"));
});
test("o servidor recusa identificadores repetidos ou inválidos", () => {
  const state = { version: 1, contacts: [], works: [], visits: [], plans: [] };
  assert.doesNotThrow(() => validateState(state));
  const record = { id: "d2cbf329-6263-4ffa-8e7e-84ec983ee7f4" };
  assert.throws(() => validateState({ ...state, works: [record, record] }));
  assert.throws(() => validateState({ ...state, works: [{ id: "unsafe" }] }));
});

test("produtos exigem administração e nomes únicos inclusive acentos e espaços", () => {
  assert.throws(() => requireCatalogAdmin({ role: "collaborator" }), {
    status: 403,
  });
  assert.doesNotThrow(() => requireCatalogAdmin({ role: "admin" }));
  assert.doesNotThrow(() => requireCatalogAdmin({ role: "supervisor", teamId: "tulio" }));
  assert.throws(
    () =>
      validateState({
        ...emptyData(),
        products: [{ id: crypto.randomUUID(), name: "DIVISORIAS" }],
      }),
    /repetidos/,
  );
  assert.throws(() => validateRecord("products", { name: "" }));
  const state = {
    version: 1,
    contacts: [],
    works: [],
    visits: [],
    plans: [],
    products: [
      { id: "d2cbf329-6263-4ffa-8e7e-84ec983ee7f4", name: "ACABAMENTO NOVO" },
      { id: "d2cbf329-6263-4ffa-8e7e-84ec983ee7f5", name: "acabamento  novo" },
    ],
  };
  assert.throws(() => validateState(state), /repetidos/);
});

test("edição de produto inicial respeita unicidade e exclusão preserva o cadastro", () => {
  const original = DEFAULT_PRODUCTS.find((item) => item.name === "FORRO");
  assert.doesNotThrow(() =>
    validateState({
      ...emptyData(),
      products: [{ ...original, name: "FORRO NOVO" }],
    }),
  );
  assert.throws(
    () =>
      validateState({
        ...emptyData(),
        products: [{ ...original, name: "GESSO" }],
      }),
    /repetidos/,
  );
  assert.doesNotThrow(() =>
    requireCatalogChange(original, { ...original, deleted: true }),
  );
  assert.throws(() =>
    requireCatalogChange(original, {
      ...original,
      name: "OUTRO",
      deleted: true,
    }),
  );
  assert.throws(
    () => requireCatalogChange({ ...original, deleted: true }, original),
    { status: 409 },
  );
  assert.throws(() =>
    validateRecord("contacts", {
      id: crypto.randomUUID(),
      name: "Contato",
      role: "architect",
      deleted: "true",
    }),
  );
  assert.throws(() => validateRecord("works", { deleted: true }));
});

test("fotos de produtos exigem referências próprias, únicas e no máximo seis imagens", () => {
  const photo = {
    id: crypto.randomUUID(),
    scope: "product",
    key: "produtos/teste.jpg",
    name: "Foto",
  };
  const product = { name: "GESSO", photos: [photo] };
  assert.doesNotThrow(() => validateRecord("products", product));
  assert.throws(() =>
    validateRecord("products", { ...product, photos: [photo, photo] }),
  );
  assert.throws(() =>
    validateRecord("products", {
      ...product,
      photos: [{ ...photo, scope: "visit" }],
    }),
  );
  assert.throws(() =>
    validateRecord("products", {
      ...product,
      photos: [{ ...photo, url: "https://arbitrario.invalid/image.jpg" }],
    }),
  );
  assert.throws(() =>
    validateRecord("products", {
      ...product,
      photos: Array.from({ length: 7 }, () => ({
        ...photo,
        id: crypto.randomUUID(),
      })),
    }),
  );
});

test("arquitetos e empreiteiros compartilhados não liberam contatos privados nem transferência de cargo", () => {
  const member = { role: "collaborator", teamId: "charles" };
  for (const role of ["architect", "contractor"])
    assert.doesNotThrow(() =>
      requireContactWrite(member, "claudionor", { role }, { role }),
    );
  assert.doesNotThrow(() =>
    requireContactWrite(
      member,
      "shared",
      { role: "architect" },
      { role: "architect" },
    ),
  );
  assert.throws(
    () =>
      requireContactWrite(
        member,
        "claudionor",
        { role: "responsible" },
        { role: "architect" },
      ),
    { status: 403 },
  );
  assert.throws(
    () =>
      requireContactWrite(
        member,
        "claudionor",
        { role: "architect" },
        { role: "responsible" },
      ),
    { status: 403 },
  );
  assert.throws(
    () =>
      requireContactWrite(member, "claudionor", undefined, {
        role: "architect",
      }),
    { status: 403 },
  );
});

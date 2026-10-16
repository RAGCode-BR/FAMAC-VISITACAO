import test from "node:test";
import assert from "node:assert/strict";
import { requireOwner, validateState } from "../server/policy.mjs";
import { pinIdentity } from "../src/lib/identity.mjs";

test("a identidade do PIN é numérica e não exige e-mail do colaborador", () => {
  assert.equal(pinIdentity("100001"), "pin-100001@login.famac.invalid");
  for (const pin of ["123", "1234567", "charles", "../100001"])
    assert.throws(() => pinIdentity(pin));
});
test("somente a administração pode operar em nome de outro colaborador", () => {
  const member = { role: "collaborator", teamId: "charles" };
  assert.doesNotThrow(() => requireOwner(member, "charles"));
  assert.throws(() => requireOwner(member, "celso"), { status: 403 });
  assert.doesNotThrow(() => requireOwner({ role: "admin" }, "celso"));
  assert.throws(() => requireOwner({ role: "admin" }, "qualquer-pessoa"));
});
test("o servidor recusa identificadores repetidos ou inválidos", () => {
  const state = { version: 1, contacts: [], works: [], visits: [], plans: [] };
  assert.doesNotThrow(() => validateState(state));
  const record = { id: "d2cbf329-6263-4ffa-8e7e-84ec983ee7f4" };
  assert.throws(() => validateState({ ...state, works: [record, record] }));
  assert.throws(() => validateState({ ...state, works: [{ id: "unsafe" }] }));
});

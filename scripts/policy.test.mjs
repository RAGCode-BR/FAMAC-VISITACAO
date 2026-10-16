import test from "node:test";
import assert from "node:assert/strict";
import { requireOwner, validateState } from "../server/policy.mjs";
import { pinIdentity } from "../src/lib/identity.mjs";

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
    "", "01", "100001", "900001", "charles", "../1", " 0", 0, null,
  ])
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

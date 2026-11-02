import test from "node:test";
import assert from "node:assert/strict";
import { canAccessServices } from "../src/lib/service-access.mjs";
import { applyServiceAction, requireServices } from "../server/services-store.mjs";
import { emptyData } from "../src/lib/domain.mjs";
import { newService } from "../src/lib/services.mjs";

test("Serviços exige administrador ou Túlio; supervisão de outra conta não concede acesso", () => {
  for (const member of [{ role: "collaborator", teamId: "charles" }, { role: "collaborator", teamId: "tulio" }, { role: "supervisor", teamId: "charles" }, null]) {
    assert.equal(canAccessServices(member), false);
    assert.throws(() => requireServices(member), { status: 403 });
  }
  for (const member of [{ role: "admin", name: "Admin" }, { role: "supervisor", teamId: "tulio", name: "Túlio" }]) {
    assert.equal(canAccessServices(member), true);
    const action = { type: "save", draft: { ...newService(), name: "Cliente de teste", address: "Rua A", neighborhood: "Centro", city: "Sorriso", description: "Instalação", history: [{ actor: "Autoria falsa" }], number: 999 } };
    const next = applyServiceAction(emptyData(), action, member);
    assert.equal(next.services[0].number, 1);
    assert.equal(next.services[0].history[0].actor, member.name);
    assert.equal(next.services[0].history.length, 1);
    assert.deepEqual(next.visits, []);
  }
});

test("exclusão de profissional é autorizada também no servidor", () => {
  const admin = { role: "admin", name: "Admin" };
  const data = applyServiceAction(emptyData(), { type: "installer", draft: { name: "Profissional" } }, admin);
  const id = data.installers[0].id, action = { type: "deleteInstaller", id };
  assert.throws(() => applyServiceAction(data, action, { role: "collaborator" }), { status: 403 });
  assert.throws(() => applyServiceAction(data, { ...action, id: "inválido" }, admin), { status: 400 });
  const next = applyServiceAction(data, action, { role: "supervisor", teamId: "tulio", name: "Túlio" });
  assert.equal(next.installers[0].deleted, true);
  assert.throws(() => applyServiceAction(next, { type: "installer", draft: { id, name: "Reativado" } }, admin), { status: 400 });
});

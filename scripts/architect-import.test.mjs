import test from "node:test";
import assert from "node:assert/strict";
import { planArchitects } from "./architect-import-plan.mjs";

test("triagem consolida abas e formatação, conserva campos e não importa outros cargos", () => {
  const row = {
    name: "  Arquiteta Exemplo ",
    phone: "(66) 99999-0000",
    city: "SORRISO",
    profession: "ARQUITETA",
  };
  const plan = planArchitects(
    [
      { ...row, sheet: "GERAL", consultant: "Ignorar", verified: true },
      { ...row, phone: "66 99999-0000", sheet: "OUTRA" },
      { ...row, name: "Engenheiro Exemplo", profession: "ENGENHEIRO" },
      { ...row, name: "Construtora Exemplo", profession: "CONSTRUTORA" },
      { ...row, name: "Exemplo ENG", profession: "ARQUITETO" },
      { ...row, name: "Escritório de exemplo", profession: "ARQUITETO" },
    ],
    { excludeNames: ["Escritório de exemplo"] },
  );
  assert.equal(plan.contacts.length, 1);
  assert.equal(plan.duplicates, 1);
  assert.equal(plan.excluded.length, 4);
  assert.deepEqual(
    Object.keys(plan.contacts[0]).sort(),
    ["id", "name", "role", "phone", "city", "company", "notes"].sort(),
  );
  assert.equal(plan.contacts[0].name, "Arquiteta Exemplo");
  assert.equal(plan.contacts[0].city, "SORRISO");
  assert.equal(plan.contacts[0].phone, row.phone);
  assert.equal(planArchitects([row]).contacts[0].id, plan.contacts[0].id);
});

test("nomes com dados conflitantes ficam em revisão; telefone ausente não é inventado", () => {
  const row = {
    name: "Arquiteto Exemplo",
    city: "SORRISO",
    profession: "ARQUITETO",
  };
  const conflict = planArchitects([
    { ...row, phone: "(66) 99999-0000" },
    { ...row, phone: "(66) 98888-0000" },
  ]);
  assert.equal(conflict.contacts.length, 0);
  assert.equal(conflict.excluded.length, 2);
  assert.equal(planArchitects([row]).contacts[0].phone, "");
});

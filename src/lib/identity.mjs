// Identificador técnico exclusivo do Auth. Não exige uma caixa de e-mail e
// nunca aparece no formulário de acesso. O PIN identifica; a senha autentica.
export const pinIdentity = (pin) => {
  if (typeof pin !== "string" || !/^\d$/.test(pin))
    throw new Error("Informe seu PIN de 1 número.");
  // Mantém a identidade já registrada no Auth, inclusive senhas e vínculos.
  // O identificador interno é estável e não corresponde ao PIN exibido.
  const identity = pin === "0" ? "900001" : `10000${pin}`;
  return `pin-${identity}@login.famac.invalid`;
};

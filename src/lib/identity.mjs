// Identificador técnico exclusivo do Auth. Não exige uma caixa de e-mail e
// nunca aparece no formulário de acesso. O PIN identifica; a senha autentica.
export const pinIdentity = (pin) => {
  if (!/^\d{6}$/.test(pin)) throw new Error("Informe seu PIN de 6 números.");
  return `pin-${pin}@login.famac.invalid`;
};

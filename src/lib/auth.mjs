import { createAuthClient } from "@neondatabase/auth";
import { pinIdentity } from "./identity.mjs";

export const cloudEnabled =
  import.meta.env.VITE_FAMAC_MODE !== "local" &&
  Boolean(
    import.meta.env.VITE_NEON_AUTH_URL && import.meta.env.VITE_FAMAC_API_URL,
  );
export const authClient = cloudEnabled
  ? createAuthClient(import.meta.env.VITE_NEON_AUTH_URL)
  : null;
export async function api(path, options = {}) {
  let result;
  try { result = await authClient.token(); }
  catch (cause) {
    const limited = cause.status === 429 || /too many|rate.limit/i.test(cause.message || "");
    throw Object.assign(new Error(limited ? "Muitas tentativas de acesso. Aguarde um pouco e tente novamente." : "Não foi possível conferir sua sessão. Tente entrar novamente."), { status: limited ? 429 : 401 });
  }
  if (result.error?.status === 429) throw Object.assign(new Error("Muitas tentativas de acesso. Aguarde um pouco e tente novamente."), { status: 429 });
  // O SDK 0.6 também pode devolver a sessão em cache no endpoint /token,
  // após getSession(). Nessa resposta, o JWT está em session.token.
  const token = result.data?.token || result.data?.session?.token;
  if (
    result.error ||
    typeof token !== "string" ||
    token.split(".").length !== 3
  )
    throw Object.assign(new Error("Sua sessão expirou. Entre novamente."), {
      status: 401,
    });
  let response;
  try {
    response = await fetch(
      `${import.meta.env.VITE_FAMAC_API_URL.replace(/\/$/, "")}${path}`,
      {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
          Authorization: `Bearer ${token}`,
        },
        signal: options.signal || AbortSignal.timeout(45000),
      },
    );
  } catch {
    throw new Error(
      "Não foi possível acessar o servidor. Confira sua conexão e tente novamente.",
    );
  }
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(body?.error || "Não foi possível acessar o servidor."),
      { status: response.status },
    );
  return body;
}
export async function signIn(pin, password) {
  const email = pinIdentity(pin);
  let result;
  try { result = await authClient.signIn.email({ email, password }); }
  catch { throw new Error("Não foi possível entrar. Confira sua conexão e tente novamente."); }
  if (result.error?.status === 429) throw new Error("Muitas tentativas de acesso. Aguarde um pouco e tente novamente.");
  if (result.error)
    throw new Error("PIN ou senha incorretos. Confira e tente novamente.");
  return api("/me");
}

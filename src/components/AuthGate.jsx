import React, { useEffect, useState } from "react";
import { api, authClient, cloudEnabled, signIn } from "../lib/auth.mjs";
import { repository } from "../lib/repository.mjs";
import { Field, Icon, Modal } from "./ui.jsx";

export function AccessManagement({ account }) {
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    api("/members")
      .then(setMembers)
      .catch((cause) => setError(cause.message));
  }, []);
  const reset = async (event) => {
    event.preventDefault();
    setError("");
    if (password !== confirmation)
      return setError("As senhas precisam ser iguais.");
    setBusy(true);
    try {
      const result = await authClient.admin.setUserPassword({
        userId: selected.authId,
        newPassword: password,
      });
      if (result.error)
        throw new Error(
          "Não foi possível redefinir a senha. Entre novamente como administrador.",
        );
      const revoked = await authClient.admin.revokeUserSessions({
        userId: selected.authId,
      });
      if (revoked.error)
        throw new Error(
          "A senha foi alterada, mas não foi possível encerrar as sessões anteriores. Tente novamente.",
        );
      setNotice(`Senha de ${selected.name} redefinida.`);
      setSelected(null);
      setPassword("");
      setConfirmation("");
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel access-management">
      <div className="panel-heading">
        <div>
          <h2>Acessos ao sistema</h2>
          <p>PINs da equipe e recuperação de senha pela administração.</p>
        </div>
      </div>
      {notice && <p role="status">{notice}</p>}
      {!selected && error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>PIN</th>
              <th>Acesso</th>
              <th>Senha</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.authId}>
                <td>{member.name}</td>
                <td>{member.pin}</td>
                <td>
                  {member.role === "admin"
                    ? "Administração"
                    : "Próprios registros"}
                </td>
                <td>
                  {member.authId !== account.authId && (
                    <button
                      className="button secondary"
                      aria-label={`Redefinir senha de ${member.name}`}
                      onClick={() => {
                        setSelected(member);
                        setError("");
                        setPassword("");
                        setConfirmation("");
                      }}
                    >
                      Redefinir senha
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <Modal
          title={`Senha de ${selected.name}`}
          onClose={() => setSelected(null)}
        >
          <form onSubmit={reset}>
            <p>PIN {selected.pin}. Informe a nova senha ao colaborador.</p>
            <Field
              label="Nova senha"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Field
              label="Confirmar nova senha"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <footer className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setSelected(null)}
              >
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? "Salvando…" : "Redefinir senha"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </section>
  );
}

export function PasswordForm({ onClose }) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (password !== confirmation)
      return setError("As novas senhas precisam ser iguais.");
    setBusy(true);
    try {
      const result = await authClient.changePassword({
        currentPassword: current,
        newPassword: password,
        revokeOtherSessions: true,
      });
      if (result.error)
        throw new Error("Confira sua senha atual e tente novamente.");
      setDone(true);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Alterar senha" onClose={onClose}>
      {done ? (
        <>
          <p role="status">Senha alterada com sucesso.</p>
          <button className="button primary" onClick={onClose}>
            Concluir
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <Field
            label="Senha atual"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            required
          />
          <Field
            label="Nova senha"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            hint="Use pelo menos 8 caracteres."
            required
          />
          <Field
            label="Confirmar nova senha"
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <footer className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button className="button primary" disabled={busy}>
              {busy ? "Salvando…" : "Salvar senha"}
            </button>
          </footer>
        </form>
      )}
    </Modal>
  );
}

export default function AuthGate({ children }) {
  const [account, setAccount] = useState(null);
  const [checking, setChecking] = useState(cloudEnabled);
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!cloudEnabled) return;
    let active = true;
    authClient
      .getSession()
      .then(async (result) => {
        if (result.error)
          throw new Error(
            "Não foi possível conferir sua sessão. Tente entrar novamente.",
          );
        if (result.data?.user) {
          const member = await api("/me");
          if (active) setAccount(member);
        }
      })
      .catch((cause) => {
        if (active) setError(cause.message);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const logout = async () => {
    const result = await authClient.signOut();
    if (result.error)
      throw new Error("Não foi possível encerrar sua sessão. Tente novamente.");
    repository.clear();
    setPassword("");
    setPin("");
    setError("");
    setAccount(null);
  };
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      setAccount(await signIn(pin, password));
      setPassword("");
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  };
  if (!cloudEnabled) return children(null, null);
  if (checking)
    return (
      <main className="startup">
        <h1>Conferindo seu acesso…</h1>
      </main>
    );
  if (account) return children(account, logout);
  return (
    <main className="login-page">
      <section className="login-brand">
        <img
          src={`${import.meta.env.BASE_URL}famac-logo.jpg`}
          alt="FAMAC Acabamentos"
        />
        <span className="eyebrow">CONEXÕES QUE CONSTROEM</span>
        <h1>Grandes oportunidades começam com uma visita.</h1>
        <p>
          Seu espaço para acompanhar obras, cultivar contatos e transformar
          ambientes.
        </p>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <span className="eyebrow">BEM-VINDO À FAMAC</span>
          <h2>Entre no seu espaço.</h2>
          <p>Use o PIN e a senha fornecidos pelo administrador.</p>
          <form onSubmit={submit}>
            <Field
              label="PIN"
              type="text"
              inputMode="numeric"
              autoComplete="username"
              minLength={6}
              maxLength={6}
              pattern="[0-9]{6}"
              value={pin}
              onChange={(event) =>
                setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="Seu PIN de 6 números"
              autoFocus
              required
            />
            <Field
              label="Senha"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? "Entrando…" : "Entrar"}
              <Icon name="chevron" size={18} />
            </button>
          </form>
          <p className="login-help">
            Esqueceu sua senha? Solicite a redefinição ao administrador.
          </p>
        </div>
        <span className="login-footer">
          FAMAC Acabamentos · Conexões que transformam ambientes.
        </span>
      </section>
    </main>
  );
}

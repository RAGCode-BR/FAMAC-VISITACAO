import { cloudEnabled } from "./auth.mjs";

export async function applyPendingServiceHistory(repository) {
  if (cloudEnabled || import.meta.env.VITE_FAMAC_MODE !== "local" || !import.meta.env.DEV) return null;
  let receipt = null;
  for (const cleanup of [false, true]) {
    const endpoint = cleanup ? "/__famac_local/services-history-cleanup" : "/__famac_local/services-history";
    const response = await fetch(endpoint, { cache: "no-store" });
    if (response.status === 204 || response.status === 404) continue;
    if (!response.ok) throw new Error("Não foi possível ler a operação do histórico local.");
    const job = await response.json();
    if (job.targetOrigin !== location.origin) continue;
    receipt = cleanup ? await repository.applyServiceHistoryCleanup(job) : await repository.applyServiceHistoryJob(job);
    await fetch(`${endpoint}-receipt`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(receipt),
    }).catch(() => {});
  }
  return receipt;
}

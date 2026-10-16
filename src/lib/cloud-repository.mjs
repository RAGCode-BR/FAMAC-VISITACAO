import { api } from "./auth.mjs";

let actorTeamId;
const photoCache = new Map();
export const cloudRepository = {
  setActor(teamId) {
    actorTeamId = teamId;
  },
  load() {
    return api("/state");
  },
  sync(revision, signal) {
    return api(`/state?since=${revision}`, { signal });
  },
  async photoUrl(photo, refresh = false) {
    if (photo.url && !photo.key) return photo.url;
    const cached = !refresh && photoCache.get(photo.id);
    if (cached && cached.until > Date.now()) return cached.url;
    const { url } = await api(
      `/${photo.scope === "product" ? "product-photos" : "photos"}/${photo.id}/url`,
    );
    photoCache.set(photo.id, { url, until: Date.now() + 240000 });
    return url;
  },
  async save(data) {
    const state = structuredClone(data);
    const uploaded = [];
    let uncertainCommit = false;
    const operationId = crypto.randomUUID();
    try {
      for (const visit of state.visits) {
        for (let index = 0; index < visit.photos.length; index++) {
          const photo = visit.photos[index];
          if (photo.key) continue;
          const remote = await api("/photos", {
            method: "POST",
            body: JSON.stringify({
              visitId: visit.id,
              ownerId: visit.userId,
              name: photo.name,
              content: photo.url,
            }),
          });
          uploaded.push(`/photos/${remote.id}`);
          visit.photos[index] = remote;
        }
      }
      for (const product of state.products || []) {
        if (product.deleted) continue;
        for (let index = 0; index < (product.photos || []).length; index++) {
          const photo = product.photos[index];
          if (photo.key) continue;
          const remote = await api("/product-photos", {
            method: "POST",
            body: JSON.stringify({
              productId: product.id,
              name: photo.name,
              content: photo.url,
            }),
          });
          uploaded.push(`/product-photos/${remote.id}`);
          product.photos[index] = remote;
        }
      }
      try {
        return await api("/state", {
          method: "PUT",
          body: JSON.stringify({
            state,
            revision: data.revision,
            operationId,
            actorTeamId,
          }),
        });
      } catch (error) {
        if (!error.status) {
          uncertainCommit = true;
          // Uma resposta pode se perder depois do COMMIT. Consultar a operação
          // evita registrar a mesma visita novamente ao tentar salvar.
          const outcome = await api(`/operations/${operationId}`).catch(
            () => null,
          );
          if (outcome?.committed) return this.load();
          error.message =
            "Não foi possível confirmar o salvamento. Atualize e confira o histórico antes de registrar a visita novamente.";
        }
        throw error;
      }
    } catch (error) {
      // Não remover fotos enquanto um COMMIT sem resposta ainda pode concluir.
      if (!uncertainCommit)
        await Promise.allSettled(
          uploaded.map((path) => api(path, { method: "DELETE" })),
        );
      throw error;
    }
  },
  clear() {
    photoCache.clear();
    actorTeamId = undefined;
  },
};

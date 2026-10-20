import { emptyData } from "./domain.mjs";
import { cloudEnabled } from "./auth.mjs";
import { cloudRepository } from "./cloud-repository.mjs";
import {
  applyCrmAction,
  createCrmOpportunity,
  changeCrmColumns,
  CRM_STAGES,
  markCrmVisitDeleted,
  reconcileLocalCrm,
} from "./crm.mjs";
import { person, productNames } from "./domain.mjs";
let actorTeamId = "claudionor";

// Apenas o armazenamento FAMAC. Nenhuma credencial, SDK ou conexão externa.
const DATABASE_NAME = "famac-visitacao-local-v1";
let connection;
async function database() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("application");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      connection = undefined;
      reject(
        new Error(
          "Não foi possível abrir o armazenamento local. Verifique as permissões do navegador.",
        ),
      );
    };
  });
  return connection;
}
const localRepository = {
  async load() {
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("application", "readonly");
      const request = transaction.objectStore("application").get("state");
      request.onsuccess = () => {
        try {
          resolve(
            reconcileLocalCrm(
              request.result || emptyData(),
              null,
              !request.result?.crm,
            ),
          );
        } catch (error) {
          reject(error);
        }
      };
      request.onerror = () =>
        reject(new Error("Não foi possível ler os dados locais."));
    });
  },
  async save(data) {
    let nextNumber = data.nextServiceNumber || Math.max(0, ...data.visits.map((visit) => Number(visit.serviceNumber) || 0)) + 1;
    data = { ...data, visits: data.visits.map((visit) => visit.serviceNumber ? visit : { ...visit, serviceNumber: nextNumber++ }), nextServiceNumber: nextNumber };
    data = reconcileLocalCrm(data, {
      role: "admin",
      teamId: actorTeamId,
      name: person(actorTeamId),
    });
    const db = await database();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("application", "readwrite");
      transaction.objectStore("application").put(data, "state");
      transaction.oncomplete = () => resolve(data);
      transaction.onabort = () =>
        reject(
          new Error(
            "Não foi possível salvar. O armazenamento pode estar cheio. Seus dados anteriores foram preservados.",
          ),
        );
      transaction.onerror = () => {}; // onabort comunica o erro uma única vez.
    });
  },
};
export const repository = cloudEnabled
  ? cloudRepository
  : {
      ...localRepository,
      setActor(teamId) {
        actorTeamId = teamId;
      },
      async crmAction(opportunityId, action) {
        const current = await localRepository.load();
        const crm = applyCrmAction(
          current.crm,
          opportunityId,
          action,
          { role: "admin", teamId: actorTeamId, name: person(actorTeamId) },
          productNames(current),
        );
        return localRepository.save({ ...current, crm });
      },
      async deleteVisit(id) {
        const current = await localRepository.load();
        const visit = current.visits.find((item) => item.id === id);
        if (!visit) throw new Error("Visita não encontrada.");
        const crm = markCrmVisitDeleted(current.crm, id, {
          role: "admin",
          teamId: actorTeamId,
          name: person(actorTeamId),
        });
        return localRepository.save({
          ...current,
          crm,
          visits: current.visits.filter((item) => item.id !== id),
          plans: current.plans.map((plan) => {
            if (plan.visitId !== id) return plan;
            const next = { ...plan };
            delete next.visitId;
            if (next.status === "completed") next.status = "planned";
            return next;
          }),
        });
      },
      async deleteRecord(kind, id) {
        if (!["works", "plans"].includes(kind)) throw new Error("Registro inválido.");
        const current = await localRepository.load();
        if (!current[kind].some((item) => item.id === id)) throw new Error("Registro não encontrado.");
        return localRepository.save({
          ...current,
          [kind]: current[kind].filter((item) => item.id !== id),
          ...(kind === "works" ? { plans: current.plans.filter((item) => item.workId !== id) } : {}),
        });
      },
      async createCrmOpportunity(workId, stage) {
        const current = await localRepository.load();
        const work = current.works.find((item) => item.id === workId);
        if (!work) throw new Error("Obra não encontrada.");
        const crm = createCrmOpportunity(current.crm, work, { role: "admin", teamId: actorTeamId, name: person(actorTeamId) }, { stage });
        return localRepository.save({ ...current, crm });
      },
      async changeCrmColumns(action) {
        const current = await localRepository.load();
        return localRepository.save({
          ...current,
          crm: changeCrmColumns(current.crm, action, {
            role: "admin",
            teamId: actorTeamId,
            name: person(actorTeamId),
          }),
        });
      },
      async updateCrmStageLabels(labels) {
        const current = await localRepository.load();
        return localRepository.save({ ...current, crm: { ...current.crm, stageLabels: { ...CRM_STAGES, ...labels } } });
      },
      clear() {},
      async photoUrl(photo) {
        return photo.url;
      },
    };

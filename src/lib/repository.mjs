import { emptyData } from "./domain.mjs";
import { cloudEnabled } from "./auth.mjs";
import { cloudRepository } from "./cloud-repository.mjs";
import { applyCrmAction, reconcileLocalCrm } from "./crm.mjs";
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
      clear() {},
      async photoUrl(photo) {
        return photo.url;
      },
    };

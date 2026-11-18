import { Router, type RequestHandler } from "express";
import type { Logger } from "./logger";

const normalizza = (slug: string) => slug.trim().toLowerCase();

/** Il database di un tenant: prefisso del servizio + slug normalizzato. */
export const nomeDelDbTenant = (prefisso: string) => (slug: string): string => `${prefisso}${normalizza(slug)}`;

/** Cache LRU per chiave: al massimo `max` valori, esce il meno usato (l'ordine di inserimento della `Map`). */
export const cacheLru = <T>(crea: (chiave: string) => T, max = 50) => {
  const cache = new Map<string, T>();
  return (chiave: string): T => {
    const valore = cache.has(chiave) ? cache.get(chiave)! : crea(chiave);
    cache.delete(chiave);
    cache.set(chiave, valore);
    if (cache.size > max) cache.delete(cache.keys().next().value!);
    return valore;
  };
};

export class DatabaseProtettoError extends Error {
  constructor(nome: string) {
    super(`Il database "${nome}" non è eliminabile`);
    this.name = "DatabaseProtettoError";
  }
}

export type DatabaseDiTenant = {
  prefisso: string;
  /** Database col prefisso che non sono di un tenant: il centrale del servizio (prefisso + `registry`). */
  riservati: readonly string[];
};

/** Si elimina solo il database di un tenant: col prefisso, con uno slug dopo, non riservato (si confronta il nome). */
export const verificaEliminabile = (nome: string, { prefisso, riservati }: DatabaseDiTenant): void => {
  if (!nome.startsWith(prefisso) || nome.length === prefisso.length || riservati.includes(nome)) {
    throw new DatabaseProtettoError(nome);
  }
};

/** La dismissione di un tenant. `prima` toglie ciò che rende i dati raggiungibili (es. link pubblici), prima del drop. */
export const creaDismissione = (opzioni: DatabaseDiTenant & {
  eliminaDatabase: (nome: string) => Promise<void>;
  prima?: (slug: string) => Promise<void>;
  logger: Pick<Logger, "warn">;
}) =>
  async (slug: string): Promise<void> => {
    const nome = nomeDelDbTenant(opzioni.prefisso)(slug);
    verificaEliminabile(nome, opzioni);
    await opzioni.prima?.(normalizza(slug));
    await opzioni.eliminaDatabase(nome);
    opzioni.logger.warn(`[DEPROVISION] ${nome} eliminato`);
  };

/**
 * `DELETE /internal/tenants/:slug`: la guardia dice chi può chiederla (il registro). Va montata prima della
 * risoluzione del tenant, che per un tenant in dismissione può già fallire.
 */
export const rottaDismissione = (
  guardia: RequestHandler,
  dismetti: (slug: string) => Promise<void>,
  logger: Pick<Logger, "error">,
) =>
  Router().delete("/internal/tenants/:slug", guardia, async (req, res) => {
    try {
      await dismetti(req.params.slug ?? "");
      res.status(204).send();
    } catch (error) {
      logger.error(`[internal/deprovision] ${String(error)}`);
      const protetto = error instanceof DatabaseProtettoError;
      res.status(protetto ? 400 : 500).json({ message: protetto ? error.message : "Deprovisioning failed" });
    }
  });

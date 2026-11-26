import express from "express";

/**
 * Sonda d'infrastruttura. Risponde 200 e basta: non tocca il database, non verifica dipendenze.
 *
 * Deliberato. Una health che controlla anche Mongo trasforma un'indisponibilità del database in un
 * riavvio del servizio, e un riavvio non ripara un database. Se serve sapere se le dipendenze
 * rispondono, serve una rotta diversa con un nome diverso.
 */
export const healthRouter = express.Router();

/**
 * Le health sono **aperte di proposito**, e lo dichiarano: il controllo d'avvio dei servizi
 * (`verificaRotte` di `@printee-network/auth-client`) cerca su ogni rotta una dichiarazione di chi è
 * ammesso, e una rotta senza fa fallire l'avvio in modalità «blocca». Il segno è un `Symbol.for`, globale
 * per nome: questa libreria lo mette senza dipendere da `auth-client`.
 */
export const SEGNO_DICHIARAZIONE = Symbol.for("@printee-network/dichiarazione");

const aperta = (motivo: string): express.RequestHandler =>
  Object.assign((_req: express.Request, _res: express.Response, next: express.NextFunction) => next(), {
    [SEGNO_DICHIARAZIONE]: { tipo: "aperta", descrizione: motivo },
  });

const sondaPubblica = aperta("sonda d'infrastruttura, senza dati");

healthRouter.get("/", sondaPubblica, (_req, res) => res.sendStatus(200));
healthRouter.get("/health", sondaPubblica, (_req, res) => res.sendStatus(200));

import express from "express";

/**
 * Sonda d'infrastruttura. Risponde 200 e basta: non tocca il database, non verifica dipendenze.
 *
 * Deliberato. Una health che controlla anche Mongo trasforma un'indisponibilità del database in un
 * riavvio del servizio, e un riavvio non ripara un database. Se serve sapere se le dipendenze
 * rispondono, serve una rotta diversa con un nome diverso.
 */
export const healthRouter = express.Router();

healthRouter.get("/", (_req, res) => res.sendStatus(200));
healthRouter.get("/health", (_req, res) => res.sendStatus(200));

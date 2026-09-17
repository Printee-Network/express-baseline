import type { NextFunction, Request, Response } from "express";

type Finestra = { count: number; resetAt: number };

/**
 * Limite a finestra fissa per client.
 *
 * Funziona **solo se `trust proxy` è attivo**, altrimenti dietro il proxy di Railway `req.ip` è
 * l'IP del proxy — uguale per tutti — e il limite per-client diventa un bucket globale: un utente
 * attivo fa scattare il 429 per chiunque. È il finding #4 di `report-sicurezza.md`, aperto in
 * cinque servizi su sei. `createBaselineApp` imposta `trust proxy` **prima** di qualsiasi rotta,
 * così i due pezzi non possono più essere montati separatamente.
 *
 * ⚠️ Resta in-memory e quindi **per-processo**: con più istanze ognuna ha il suo contatore, e il
 * limite effettivo è `limite × istanze`. Va bene finché si gira su un'istanza sola; per un limite
 * vero in multi-istanza serve uno store condiviso (Redis), che è un servizio in più da gestire.
 * Scritto qui perché chi lo monta lo sappia, invece di scoprirlo scalando.
 */
export const createRateLimit = (limit: number, windowMs: number) => {
  const finestre = new Map<string, Finestra>();

  return (req: Request, res: Response, next: NextFunction) => {
    const chiave = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const adesso = Date.now();
    const corrente = finestre.get(chiave);

    const finestra =
      corrente && corrente.resetAt > adesso
        ? corrente
        : { count: 0, resetAt: adesso + windowMs };

    finestra.count += 1;
    finestre.set(chiave, finestra);

    // Potatura opportunistica: senza, la mappa cresce quanto gli IP visti.
    if (finestre.size > 10_000) {
      Array.from(finestre.entries())
        .filter(([, valore]) => valore.resetAt <= adesso)
        .forEach(([voce]) => finestre.delete(voce));
    }

    if (finestra.count > limit) {
      return res
        .status(429)
        .set("Retry-After", String(Math.ceil((finestra.resetAt - adesso) / 1000)))
        .json({ message: "Too many requests" });
    }

    return next();
  };
};

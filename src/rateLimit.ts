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
export type RateLimitOptions = {
  /** Ampiezza della finestra in millisecondi. */
  readonly windowMs: number;
  /** Richieste consentite per client dentro la finestra. */
  readonly max: number;
};

/*
 * Opzioni con nome e non due numeri posizionali: `createRateLimit(60, 60_000)` e
 * `createRateLimit(60_000, 60)` compilano entrambe e significano l'opposto — un limite di 60 al
 * minuto contro uno di 60.000 ogni 60ms. Le due firme convivevano davvero nei servizi.
 */
export const createRateLimit = ({ windowMs, max }: RateLimitOptions) => {
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

    if (finestra.count > max) {
      return res
        .status(429)
        .set("Retry-After", String(Math.ceil((finestra.resetAt - adesso) / 1000)))
        .json({ message: "Too many requests" });
    }

    return next();
  };
};

import type { NextFunction, Request, Response } from "express";
import type { Logger } from "./logger";

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
 * ⚠️ **`req.ip` non è sempre un identificatore stabile.** Dipende da quanti hop di proxy ci sono
 * davvero fra il client e il processo, e quel numero lo decide il provider, non il codice: con un
 * `trustProxy` che non corrisponde alla topologia reale, `req.ip` ricade sull'indirizzo del proxy
 * — che può variare a ogni connessione. Il limite allora non "non funziona": funziona a
 * intermittenza, che è peggio, perché sembra attivo. Da qui `chiave` e il log del 429: prima di
 * scegliere il `trustProxy` giusto bisogna **vedere** cosa sta finendo nella chiave.
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
  /**
   * Come si identifica un client. Default: `req.ip`.
   *
   * Sostituibile perché l'IP non è sempre la scelta giusta — dietro certi proxy non è stabile, e
   * su una rotta di login può avere senso combinarlo con l'identità tentata. Iniettarlo evita di
   * dover riscrivere il limiter per cambiare idea.
   */
  readonly chiave?: (req: Request) => string;
  /**
   * Se presente, ogni 429 logga la chiave che lo ha causato. Volume basso — scatta solo quando il
   * limite è superato — e serve a rispondere all'unica domanda che conta quando il limite si
   * comporta in modo strano: *quale* chiave sta contando.
   */
  readonly logger?: Logger;
  /** Nome della rotta protetta, per distinguere i log di più limiter nello stesso servizio. */
  readonly nome?: string;
};

/*
 * Opzioni con nome e non due numeri posizionali: `createRateLimit(60, 60_000)` e
 * `createRateLimit(60_000, 60)` compilano entrambe e significano l'opposto — un limite di 60 al
 * minuto contro uno di 60.000 ogni 60ms. Le due firme convivevano davvero nei servizi.
 */
const chiaveDefault = (req: Request): string =>
  req.ip ?? req.socket.remoteAddress ?? "unknown";

export const createRateLimit = ({
  windowMs,
  max,
  chiave: estraiChiave = chiaveDefault,
  logger,
  nome = "rate-limit",
}: RateLimitOptions) => {
  const finestre = new Map<string, Finestra>();

  return (req: Request, res: Response, next: NextFunction) => {
    const chiave = estraiChiave(req);
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
      logger?.warn(
        `[${nome}] 429 · chiave "${chiave}" · ${finestra.count}/${max} in ${windowMs}ms`,
      );
      return res
        .status(429)
        .set("Retry-After", String(Math.ceil((finestra.resetAt - adesso) / 1000)))
        .json({ message: "Too many requests" });
    }

    return next();
  };
};

import type { Logger } from "./logger";

/**
 * Condizioni di configurazione dichiarate **all'avvio**.
 *
 * Servono a rendere rumoroso ciò che è silenzioso. Un bypass acceso non si annuncia: funziona, e
 * funzionando non lascia traccia — ci si accorge che era attivo solo andando a leggere le variabili
 * d'ambiente, cioè mai. Qui ogni avvio lo dichiara.
 *
 * Regole come **dati**, non catene di `if`: aggiungerne una è aggiungere una riga, e l'elenco si
 * legge come un elenco invece che come un algoritmo.
 */
export type RegolaAvvio = {
  readonly nome: string;
  /** `true` quando la condizione è degna di nota. */
  readonly attiva: () => boolean;
  readonly livello: "info" | "warn" | "error";
  readonly messaggio: string;
};

export const verificaAvvio = (
  regole: readonly RegolaAvvio[],
  logger: Logger,
  prefisso: string,
): void => {
  regole
    .filter((regola) => regola.attiva())
    .forEach((regola) => logger[regola.livello](`${prefisso} ${regola.messaggio}`));
};

/**
 * Regole comuni a tutti i servizi. Un servizio le compone con le proprie invece di riscriverle:
 * `verificaAvvio([...regoleComuni({...}), ...mieRegole], logger, "[CC-API]")`.
 */
export const regoleComuni = (contesto: {
  readonly isProduction: boolean;
  readonly allowDebug: boolean;
  readonly corsAllowedOrigins: readonly string[];
}): readonly RegolaAvvio[] => [
  {
    nome: "is-production",
    attiva: () => !contesto.isProduction,
    livello: "info",
    messaggio:
      "IS_PRODUCTION non è 'true': i bypass di sviluppo sono ABILITABILI. In un ambiente che imita " +
      "la produzione dovrebbe essere 'true', altrimenti non la imita dove conta.",
  },
  {
    nome: "allow-debug",
    attiva: () => contesto.allowDebug && contesto.isProduction,
    livello: "warn",
    messaggio:
      "ALLOW_DEBUG attivo in produzione: il log passa a livello 'debug'. Alza la verbosità, e un " +
      "log più fitto in produzione finisce per registrare più del previsto.",
  },
  {
    nome: "cors-vuoto",
    attiva: () => contesto.corsAllowedOrigins.length === 0,
    livello: "info",
    messaggio:
      "CORS: nessuna origin browser ammessa — corretto se il servizio è chiamato solo " +
      "server-to-server, un guasto se un frontend deve raggiungerlo.",
  },
];

import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import http from "http";
import morgan from "morgan";
import { corsAllowlist } from "./cors";
import { healthRouter } from "./health";
import { consoleLogger, type Logger } from "./logger";

export type BaselineOptions = {
  /** Nome del servizio: compare nei log d'avvio. */
  readonly serviceName: string;
  readonly port: number | string;
  /**
   * Origin browser ammesse. **Vuoto = nessuna**, che è la risposta giusta per un servizio chiamato
   * server-to-server. Non esiste un modo di scrivere "tutte": vedi `cors.ts`.
   */
  readonly corsAllowedOrigins?: readonly string[];
  /**
   * Limite del corpo delle richieste. Default **64kb**, deliberatamente basso.
   *
   * Nei sei servizi esistenti va da 64kb a 50mb — un fattore 800 che nessuno ha deciso: è stato
   * ereditato per copia. Un default basso sbaglia nella direzione che si nota subito (un upload
   * legittimo fallisce e lo si alza consapevolmente), invece che in quella che non si nota mai.
   */
  readonly bodyLimit?: string;
  /**
   * Prefissi serviti con CORS **aperto**, montati prima dell'allowlist.
   *
   * Per ciò che è pubblico per natura e non per distrazione: il JWKS di `auth` (`/.well-known`)
   * sono chiavi pubbliche, fatte apposta per essere lette da chiunque. Tenerli dentro l'allowlist
   * significherebbe elencare ogni consumatore presente e futuro di una risorsa che non ha
   * consumatori noti.
   *
   * L'elenco è esplicito e va scritto: la differenza fra "pubblico" e "aperto per sbaglio" è che
   * il primo si dichiara.
   */
  readonly publicCorsPaths?: readonly string[];
  readonly logger?: Logger;
  /**
   * Hop di proxy di cui fidarsi. Default `1`: su Railway c'è esattamente un reverse proxy davanti.
   * Alzarlo senza averne uno vero significa fidarsi di un `X-Forwarded-For` che il client scrive.
   */
  readonly trustProxy?: number | boolean;
};

export type BaselineApp = {
  readonly app: express.Express;
  readonly server: http.Server;
  /** Avvio esplicito: vedi sotto perché non parte all'import. */
  readonly listen: (onReady?: () => void) => void;
};

/**
 * Il minimo da cui parte ogni backend Express di Printee.
 *
 * Non è un framework e non conosce nessun dominio: monta le preoccupazioni trasversali nell'ordine
 * giusto e restituisce l'`app` su cui il servizio registra le proprie rotte.
 *
 * **L'ordine dei middleware è parte del contratto.** `helmet` prima di `cors` perché anche le
 * risposte di preflight devono avere gli header di sicurezza; i body parser dopo il logging perché
 * una richiesta rifiutata per dimensione deve comunque comparire nei log.
 *
 * **`trust proxy` è impostato qui**, non lasciato al servizio: separarlo dal rate limit è ciò che
 * ha prodotto il finding #4 in cinque servizi su sei — il limite c'era, la condizione perché
 * funzionasse no.
 */
export const createBaselineApp = (options: BaselineOptions): BaselineApp => {
  const logger = options.logger ?? consoleLogger;
  const limite = options.bodyLimit ?? "64kb";
  const origins = options.corsAllowedOrigins ?? [];

  const app = express();
  const server = http.createServer(app);

  app.set("trust proxy", options.trustProxy ?? 1);

  app.use(helmet());
  app.use(compression());
  app.use(morgan("combined"));
  // I parser inclusi in Express (≥ 4.16): la dipendenza `body-parser` separata non serve.
  app.use(express.json({ limit: limite }));
  app.use(express.urlencoded({ extended: true, limit: limite }));
  // Prima dell'allowlist: per una preflight il middleware CORS chiude la richiesta, quindi un
  // percorso pubblico montato dopo non verrebbe mai raggiunto.
  (options.publicCorsPaths ?? []).forEach((percorso) => app.use(percorso, cors()));

  app.use(cors(corsAllowlist(origins)));
  app.use("/", healthRouter);

  /**
   * L'ascolto è esplicito e **non parte all'import**.
   *
   * In `cc-api` il `server.listen` sta prima della registrazione dei middleware: funziona solo
   * perché la valutazione del modulo finisce prima che arrivi una richiesta. Qui il servizio decide
   * quando è pronto — dopo aver caricato le chiavi, connesso il database, montato le rotte.
   */
  const listen = (onReady?: () => void): void => {
    server.listen(options.port, () => {
      logger.info(
        `[${options.serviceName}] in ascolto sulla porta ${options.port} · body ${limite} · ` +
          `CORS ${origins.length === 0 ? "chiuso" : origins.join(", ")}` +
          (options.publicCorsPaths?.length
            ? ` · pubblici: ${options.publicCorsPaths.join(", ")}`
            : ""),
      );
      onReady?.();
    });
  };

  return { app, server, listen };
};

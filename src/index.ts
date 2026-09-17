/**
 * `@printee-network/express-baseline`
 *
 * Il minimo da cui parte ogni backend Express di Printee. Centralizza il **codice**
 * infrastrutturale comune, non il **traffico**: nessun hop di rete in più, a differenza di un
 * gateway (vedi `PROGETTO_GATEWAY.md`).
 *
 * **Cosa NON c'è dentro, di proposito:**
 * - niente che tocchi Mongo o un database;
 * - nessun tipo di dominio;
 * - `authorize()`, i ruoli e la verifica dei token → stanno in `@printee-network/auth-client`;
 * - la risoluzione del tenant → dipende dai dati, resta nei servizi.
 *
 * Il nome è un confine: se non riguarda lo strato HTTP di Express, non va qui.
 */
export { createBaselineApp } from "./createBaselineApp";
export type { BaselineApp, BaselineOptions } from "./createBaselineApp";
export { corsAllowlist } from "./cors";
export { healthRouter } from "./health";
export { createRateLimit } from "./rateLimit";
export type { RateLimitOptions } from "./rateLimit";
export { regoleComuni, verificaAvvio } from "./bootGuard";
export type { RegolaAvvio } from "./bootGuard";
export { consoleLogger } from "./logger";
export type { Logger } from "./logger";

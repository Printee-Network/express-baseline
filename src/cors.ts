import type { CorsOptions } from "cors";

/**
 * CORS **chiuso di default**, con allowlist esplicita (report-sicurezza #5).
 *
 * `origin: "*"` è il difetto che `cc-api` e `op-api` si sono passati per copia e che `cc-be` ha
 * ancora: qui non è nemmeno esprimibile. Un'allowlist vuota significa "nessuna origin browser", che
 * è la risposta giusta per un servizio chiamato server-to-server — la maggioranza dei nostri.
 *
 * Le richieste **senza** `Origin` passano sempre: sono quelle server-to-server e quelle degli
 * strumenti da riga di comando. CORS protegge il browser da altri siti, non il server dai client.
 */
export const corsAllowlist = (origins: readonly string[]): CorsOptions => ({
  origin: (origin, callback) => callback(null, !origin || origins.includes(origin)),
  credentials: true,
});

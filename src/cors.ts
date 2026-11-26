import type { CorsOptions } from "cors";

/**
 * CORS **chiuso di default**, con allowlist esplicita.
 *
 * `origin: "*"` è il difetto che si passa più facilmente da un servizio all'altro per copia: qui non
 * è nemmeno esprimibile. Un'allowlist vuota significa "nessuna origin browser", che
 * è la risposta giusta per un servizio chiamato server-to-server — la maggioranza dei nostri.
 *
 * Le richieste **senza** `Origin` passano sempre: sono quelle server-to-server e quelle degli
 * strumenti da riga di comando. CORS protegge il browser da altri siti, non il server dai client.
 */
export const corsAllowlist = (origins: readonly string[]): CorsOptions => ({
  origin: (origin, callback) => callback(null, !origin || origins.includes(origin)),
  credentials: true,
});

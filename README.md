# @printee-network/express-baseline

Il minimo da cui parte ogni backend Express di Printee: `trust proxy`, CORS ad allowlist, helmet,
rate limit, guardia d'avvio, `/health`.

**Centralizza il codice infrastrutturale comune, non il traffico.** A differenza di un gateway non
aggiunge nessun hop di rete — le ragioni della scelta stanno in `PROGETTO_GATEWAY.md`.

## Perché esiste

I sei backend avevano sei implementazioni delle stesse preoccupazioni, divergenti:

| | limite body | `trust proxy` | CORS |
|---|---|---|---|
| `auth` | 64kb | ✅ | allowlist |
| `op-api` | 256kb | ❌ | allowlist |
| `cc-api` | 10mb | ❌ | allowlist |
| `be-registry` | 50mb | ❌ | allowlist |
| `cc-be` | 10mb | ❌ | `cors()` aperto |

Un fattore **800** fra il limite più basso e il più alto, che nessuno ha deciso: è stato ereditato
per copia. `op-api` è nato dal blueprint di `cc-api` e si è portato dietro `cors: "*"` e un rate
limit senza `trust proxy` — cioè un limite per-IP che dietro un proxy diventa un bucket globale
(`report-sicurezza.md` #4, aperto in cinque servizi su sei).

L'obiettivo è che **la sicurezza non dipenda dalla memoria di chi crea il prossimo microservizio.**

## Uso

```ts
import { createBaselineApp, createRateLimit } from "@printee-network/express-baseline";

const { app, listen } = createBaselineApp({
  serviceName: "CC-API",
  port: 5100,
  corsAllowedOrigins: config.corsAllowedOrigins, // vuoto = nessuna origin browser
  bodyLimit: "256kb",                            // default 64kb
  logger,                                        // il winston del servizio
});

app.use("/catalogs", createRateLimit(60, 60_000), catalogRouter);

listen();
```

### Guardia d'avvio

```ts
import { regoleComuni, verificaAvvio } from "@printee-network/express-baseline";

verificaAvvio(
  [
    ...regoleComuni({ isProduction, allowDebug, corsAllowedOrigins }),
    {
      nome: "slug-header",
      attiva: () => !isProduction && process.env.ALLOW_SLUG_HEADER_AUTH === "true",
      livello: "warn",
      messaggio: "ALLOW_SLUG_HEADER_AUTH attivo: il tenant può essere dichiarato in un header non autenticato.",
    },
  ],
  logger,
  "[CC-API]",
);
```

Un bypass acceso non si annuncia: funziona, e funzionando non lascia traccia. Questo lo dichiara a
ogni avvio.

## Scelte che sono parte del contratto

**L'ordine dei middleware.** `helmet` prima di `cors`, così anche le risposte di preflight hanno gli
header di sicurezza; i body parser dopo il logging, così una richiesta rifiutata per dimensione
compare comunque nei log.

**`trust proxy` è impostato qui**, non lasciato al servizio. Separarlo dal rate limit è ciò che ha
prodotto il finding #4: il limite c'era, la condizione perché funzionasse no.

**CORS chiuso di default**, e `origin: "*"` non è esprimibile. Un'allowlist vuota significa "nessuna
origin browser", che è la risposta giusta per un servizio chiamato server-to-server. Le richieste
senza header `Origin` passano sempre: CORS protegge il browser da altri siti, non il server dai
client.

**Limite del corpo a 64kb di default.** Basso di proposito: sbaglia nella direzione che si nota
subito — un upload legittimo fallisce e lo si alza consapevolmente — invece che in quella che non si
nota mai.

**`listen()` è esplicito e non parte all'import.** Il servizio decide quando è pronto: dopo aver
caricato le chiavi, connesso il database, montato le rotte.

## Limiti dichiarati

Il **rate limit è in-memory e quindi per-processo**: con più istanze ognuna ha il suo contatore, e il
limite effettivo è `limite × istanze`. Va bene su un'istanza sola; per un limite vero in
multi-istanza serve uno store condiviso (Redis). Scritto qui perché chi lo monta lo sappia, invece
di scoprirlo scalando.

La **`/health` risponde 200 e basta**: non tocca il database. Una health che controlla anche Mongo
trasforma un'indisponibilità del database in un riavvio del servizio, e un riavvio non ripara un
database.

## Cosa NON c'è dentro, di proposito

- niente che tocchi Mongo o un database;
- nessun tipo di dominio;
- `authorize()`, i ruoli e la verifica dei token → `@printee-network/auth-client`;
- la risoluzione del tenant → dipende dai dati, resta nei servizi.

**Il nome è un confine**: se non riguarda lo strato HTTP di Express, non va qui. Vale anche per i
quattro frontend Next, che hanno bisogni diversi (middleware di Next, non di Express) e che questa
libreria esclude apposta.

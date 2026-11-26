# @printee-network/express-baseline

Il minimo da cui parte ogni backend Express di Printee: `trust proxy`, CORS ad allowlist, helmet,
rate limit, guardia d'avvio, `/health`.

**Centralizza il codice infrastrutturale comune, non il traffico.** A differenza di un gateway non
aggiunge nessun hop di rete.

## Perché esiste

Ogni backend aveva la sua implementazione delle stesse preoccupazioni, e le implementazioni
divergevano: limiti del corpo fra 64kb e 50mb che nessuno aveva deciso, `trust proxy` assente quasi
ovunque, CORS ad allowlist in alcuni servizi e aperto in altri. Erano stati ereditati per copia da un
servizio al successivo, insieme ai difetti: un rate limit senza `trust proxy` è un limite per-IP che
dietro un proxy diventa un bucket globale.

L'obiettivo è che **la sicurezza non dipenda dalla memoria di chi crea il prossimo microservizio.**

## Uso

```ts
import { createBaselineApp, createRateLimit } from "@printee-network/express-baseline";

const { app, listen } = createBaselineApp({
  serviceName: "SERVIZIO",
  port: 3000,
  corsAllowedOrigins: config.corsAllowedOrigins, // vuoto = nessuna origin browser
  bodyLimit: "256kb",                            // default 64kb
  publicCorsPaths: ["/public"],                  // pubblici per natura, fuori dall'allowlist
  logger,                                        // il winston del servizio
});

// ...tutte le rotte, per esempio:
app.use("/catalogs", createRateLimit({ max: 60, windowMs: 60_000 }), catalogRouter);

listen(); // una volta sola, dopo le rotte, mai all'import
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
  "[SERVIZIO]",
);
```

Un bypass acceso non si annuncia: funziona, e funzionando non lascia traccia. Questo lo dichiara a
ogni avvio.

### Servizi con un database per tenant

```ts
import { cacheLru, creaDismissione, nomeDelDbTenant, rottaDismissione } from "@printee-network/express-baseline";

export const dbDelTenant = nomeDelDbTenant("svc_");                 // (slug) => "svc_<slug>"
export const getTenantDb = cacheLru((nome) => new MongoDb(nome));   // al massimo 50 handle

const dismetti = creaDismissione({
  prefisso: "svc_",
  riservati: ["svc_registry"],                                       // il database centrale
  eliminaDatabase: async (nome) => { await (await client).db(nome).dropDatabase(); },
  logger,
});
app.use(rottaDismissione(soloIlRegistro, dismetti, logger));         // DELETE /internal/tenants/:slug
```

La protezione sta sul **nome** (`verificaEliminabile`): col prefisso, con uno slug, non riservato. Lo
slug `registry` darebbe proprio il database centrale. Il database lo elimina la funzione del servizio:
la libreria non tocca Mongo.

## Scelte che sono parte del contratto

**L'ordine dei middleware.** `helmet` prima di `cors`, così anche le risposte di preflight hanno gli
header di sicurezza; i body parser dopo il logging, così una richiesta rifiutata per dimensione
compare comunque nei log.

**`trust proxy` è impostato qui**, non lasciato al servizio. Separarlo dal rate limit significa avere
il limite senza la condizione perché funzioni.

**CORS chiuso di default**, e `origin: "*"` non è esprimibile. Un'allowlist vuota significa "nessuna
origin browser", che è la risposta giusta per un servizio chiamato server-to-server. Le richieste
senza header `Origin` passano sempre: CORS protegge il browser da altri siti, non il server dai
client.

**Limite del corpo a 64kb di default.** Basso di proposito: sbaglia nella direzione che si nota
subito — un upload legittimo fallisce e lo si alza consapevolmente — invece che in quella che non si
nota mai.

**`listen()` è esplicito e non parte all'import.** Il servizio decide quando è pronto: dopo aver
caricato le chiavi, connesso il database, montato le rotte. Un `listen` scritto **prima** dei middleware
funziona solo perché la valutazione del modulo finisce prima che arrivi una richiesta.

**Il rate limit prende opzioni con nome**, non due numeri posizionali: `createRateLimit(60, 60_000)`
e `createRateLimit(60_000, 60)` compilano entrambe e significano l'opposto. Le due firme
convivevano davvero, in servizi diversi.

**`publicCorsPaths` per ciò che è pubblico per natura**, non per distrazione: il JWKS di un IdP sono
chiavi fatte apposta per essere lette da chiunque. Montati prima dell'allowlist, perché su una
preflight il middleware CORS chiude la richiesta e un percorso montato dopo non verrebbe raggiunto.

## Limiti dichiarati

Il **rate limit è in-memory e quindi per-processo**: con più istanze ognuna ha il suo contatore, e il
limite effettivo è `limite × istanze`. Va bene su un'istanza sola; per un limite vero in
multi-istanza serve uno store condiviso (Redis). Scritto qui perché chi lo monta lo sappia, invece
di scoprirlo scalando.

La **`/health` risponde 200 e basta**: non tocca il database. Una health che controlla anche Mongo
trasforma un'indisponibilità del database in un riavvio del servizio, e un riavvio non ripara un
database.

## Cosa NON c'è dentro, di proposito

- niente che tocchi Mongo o un database (la dismissione riceve dal servizio la funzione che elimina);
- nessun tipo di dominio;
- `authorize()`, i ruoli e la verifica dei token → `@printee-network/auth-client`;
- la risoluzione del tenant → dipende dai dati, resta nei servizi.

**Il nome è un confine**: se non riguarda lo strato HTTP di Express, non va qui (unica eccezione, i
pezzi comuni ai servizi con un database per tenant). Vale anche per i
frontend Next, che hanno bisogni diversi (middleware di Next, non di Express) e che questa
libreria esclude apposta.

## Test

```bash
npm test
```

Hanno una suite il rate limit, il cui malfunzionamento non si vede (un limite rotto lascia passare
tutto senza dare errore), e la protezione della dismissione, che decide quale database si può
eliminare.

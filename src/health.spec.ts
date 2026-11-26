import express from "express";
import { healthRouter, SEGNO_DICHIARAZIONE } from "./health";

/**
 * Le health dichiarano di essere aperte, perché il controllo d'avvio dei servizi vuole una dichiarazione
 * prima del primo handler di ogni rotta. La forma del segno è quella che il controllo riconosce.
 */
describe("health", () => {
  const rotte = (healthRouter.stack as any[]).filter((strato) => strato.route);

  it.each(["/", "/health"])("%s dichiara di essere aperta prima dell'handler", (percorso) => {
    const rotta = rotte.find((strato) => strato.route.path === percorso).route;
    expect(rotta.stack).toHaveLength(2);
    expect(rotta.stack[0].handle[SEGNO_DICHIARAZIONE]).toEqual({ tipo: "aperta", descrizione: expect.any(String) });
    expect(rotta.stack[1].handle[SEGNO_DICHIARAZIONE]).toBeUndefined();
  });

  it("il segno è quello globale", () => {
    expect(SEGNO_DICHIARAZIONE).toBe(Symbol.for("@printee-network/dichiarazione"));
  });

  it("risponde ancora 200", async () => {
    const server = express().use(healthRouter).listen(0);
    await new Promise((pronto) => server.once("listening", pronto));
    const porta = (server.address() as { port: number }).port;
    const stati = await Promise.all(["/", "/health"].map(async (p) => (await fetch(`http://127.0.0.1:${porta}${p}`)).status));
    await new Promise((chiuso) => server.close(chiuso));
    expect(stati).toEqual([200, 200]);
  });
});

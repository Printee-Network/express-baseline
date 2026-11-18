import express from "express";
import http from "http";
import type { AddressInfo } from "net";
import { cacheLru, creaDismissione, DatabaseProtettoError, nomeDelDbTenant, rottaDismissione } from "./tenant";

const silenzioso = { warn: jest.fn(), error: jest.fn() };
const dbDi = { prefisso: "svc_", riservati: ["svc_registry"] };

describe("nomeDelDbTenant", () => {
  it("prefisso + slug normalizzato", () => {
    expect(nomeDelDbTenant("svc_")("  Acme ")).toBe("svc_acme");
  });
});

describe("cacheLru", () => {
  it("crea una volta per chiave e scarta la meno usata", () => {
    const crea = jest.fn((k: string) => ({ k }));
    const prendi = cacheLru(crea, 2);
    const a = prendi("a");
    prendi("b");
    expect(prendi("a")).toBe(a); // «a» torna la più recente
    prendi("c"); // esce «b»
    expect(crea).toHaveBeenCalledTimes(3);
    prendi("b");
    expect(crea).toHaveBeenCalledTimes(4);
    expect(prendi("a")).not.toBe(a); // uscita quando è rientrata «b»
  });
});

describe("creaDismissione", () => {
  const crea = (prima?: (slug: string) => Promise<void>) => {
    const eliminaDatabase = jest.fn(async () => undefined);
    return { eliminaDatabase, dismetti: creaDismissione({ ...dbDi, eliminaDatabase, prima, logger: silenzioso }) };
  };

  it("elimina il database del tenant, dopo il passo `prima`", async () => {
    const ordine: string[] = [];
    const { dismetti, eliminaDatabase } = crea(async (slug) => { ordine.push(`prima ${slug}`); });
    eliminaDatabase.mockImplementation(async () => { ordine.push("drop"); });
    await dismetti(" Acme ");
    expect(eliminaDatabase).toHaveBeenCalledWith("svc_acme");
    expect(ordine).toEqual(["prima acme", "drop"]);
  });

  it.each(["registry", " REGISTRY ", "", "   "])("non elimina mai il centrale né un nome senza slug (%j)", async (slug) => {
    const { dismetti, eliminaDatabase } = crea();
    await expect(dismetti(slug)).rejects.toThrow(DatabaseProtettoError);
    expect(eliminaDatabase).not.toHaveBeenCalled();
  });
});

describe("rottaDismissione", () => {
  const chiama = async (dismetti: (slug: string) => Promise<void>, ammesso = true) => {
    const app = express().use(rottaDismissione((_req, res, next) => (ammesso ? next() : res.status(403).end()), dismetti, silenzioso));
    const server = http.createServer(app).listen(0);
    const { port } = server.address() as AddressInfo;
    try {
      const r = await fetch(`http://127.0.0.1:${port}/internal/tenants/acme`, { method: "DELETE" });
      return { status: r.status, body: r.status === 204 ? undefined : await r.json().catch(() => undefined) };
    } finally {
      server.close();
    }
  };

  it("204 se va", async () => {
    const dismetti = jest.fn(async () => undefined);
    expect((await chiama(dismetti)).status).toBe(204);
    expect(dismetti).toHaveBeenCalledWith("acme");
  });

  it("400 col motivo se il database è protetto, 500 generico altrimenti", async () => {
    expect(await chiama(async () => { throw new DatabaseProtettoError("svc_registry"); }))
      .toEqual({ status: 400, body: { message: 'Il database "svc_registry" non è eliminabile' } });
    expect(await chiama(async () => { throw new Error("rete"); }))
      .toEqual({ status: 500, body: { message: "Deprovisioning failed" } });
  });

  it("la guardia viene prima", async () => {
    const dismetti = jest.fn(async () => undefined);
    expect((await chiama(dismetti, false)).status).toBe(403);
    expect(dismetti).not.toHaveBeenCalled();
  });
});

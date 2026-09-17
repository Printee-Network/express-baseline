import { createRateLimit } from "./rateLimit";

const req = (ip = "1.2.3.4") => ({ ip, socket: { remoteAddress: ip } }) as any;

const res = () => {
  const r: any = {};
  r.status = jest.fn(() => r);
  r.set = jest.fn(() => r);
  r.json = jest.fn(() => r);
  return r;
};

describe("createRateLimit", () => {
  it("permette fino a max richieste, poi 429", () => {
    const mw = createRateLimit({ windowMs: 1000, max: 2 });
    const next = jest.fn();
    const r = req();

    mw(r, res(), next);
    mw(r, res(), next);
    expect(next).toHaveBeenCalledTimes(2);

    const terza = res();
    mw(r, terza, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(terza.status).toHaveBeenCalledWith(429);
  });

  it("conta per client e non globalmente", () => {
    const mw = createRateLimit({ windowMs: 1000, max: 1 });
    const next = jest.fn();

    mw(req("1.1.1.1"), res(), next);
    mw(req("2.2.2.2"), res(), next);

    // Due client diversi hanno finestre diverse: è ciò che `trust proxy` rende possibile.
    // Senza, dietro un reverse proxy entrambi avrebbero l'IP del proxy e il secondo sarebbe
    // rifiutato — il bucket globale del report #4.
    expect(next).toHaveBeenCalledTimes(2);
  });

  it("riapre la finestra una volta scaduta", () => {
    jest.useFakeTimers().setSystemTime(0);
    const mw = createRateLimit({ windowMs: 1000, max: 1 });
    const next = jest.fn();
    const r = req();

    mw(r, res(), next);
    const bloccata = res();
    mw(r, bloccata, next);
    expect(bloccata.status).toHaveBeenCalledWith(429);

    jest.setSystemTime(1001);
    mw(r, res(), next);
    expect(next).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it("indica al client quando ritentare", () => {
    const mw = createRateLimit({ windowMs: 5000, max: 0 });
    const r = res();
    mw(req(), r, jest.fn());
    expect(r.set).toHaveBeenCalledWith("Retry-After", expect.any(String));
  });
});

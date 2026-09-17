/**
 * Il logger lo fornisce il servizio: ognuno ha il suo (winston, con i suoi transport).
 *
 * Iniettato e non importato perché questa libreria non deve decidere **dove** finiscono i log —
 * solo pretendere che un posto ci sia. Il default scrive su console: un servizio che dimentica di
 * passarlo resta rumoroso, non muto, che è l'errore meno grave dei due.
 */
export type Logger = {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
};

export const consoleLogger: Logger = {
  info: (m) => console.log(m),
  warn: (m) => console.warn(m),
  error: (m) => console.error(m),
};

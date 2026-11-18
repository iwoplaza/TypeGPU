import type { LogSupport } from './types.ts';

let registeredSupport: LogSupport | undefined;

/**
 * Makes `console.*` available to every shader in the program. Called when the logging
 * implementation is evaluated, which in a tree-shaken bundle only happens if some function
 * that logs references it, see `consoleLogSupport`.
 */
export function registerLogSupport(support: LogSupport): LogSupport {
  registeredSupport = support;
  return support;
}

export function getLogSupport(): LogSupport | undefined {
  return registeredSupport;
}

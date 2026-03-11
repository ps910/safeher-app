/**
 * Production-safe logger — Suppresses all logs in release builds (Vuln #5)
 * In __DEV__ mode: passes through to console
 * In production: silently drops all log output (no location/PII leaks)
 */

type LogFn = (...args: unknown[]) => void;

interface ILogger {
  log: LogFn;
  warn: LogFn;
  error: LogFn;
  info: LogFn;
}

const Logger: ILogger = {
  log: (...args: unknown[]) => {
    if (__DEV__) console.log(...args);
  },
  warn: (...args: unknown[]) => {
    if (__DEV__) console.warn(...args);
  },
  error: (...args: unknown[]) => {
    if (__DEV__) console.error(...args);
  },
  info: (...args: unknown[]) => {
    if (__DEV__) console.info(...args);
  },
};

export default Logger;

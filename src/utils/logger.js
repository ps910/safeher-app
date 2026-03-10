/**
 * Production-safe logger — Suppresses all logs in release builds (Vuln #5)
 * In __DEV__ mode: passes through to console
 * In production: silently drops all log output (no location/PII leaks)
 */
const Logger = {
  log: (...args) => {
    if (__DEV__) console.log(...args);
  },
  warn: (...args) => {
    if (__DEV__) console.warn(...args);
  },
  error: (...args) => {
    if (__DEV__) console.error(...args);
  },
  info: (...args) => {
    if (__DEV__) console.info(...args);
  },
};

export default Logger;

/** Minimal structured logger. Job output is parsed by the admin dashboard. */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.JFI_LOG_LEVEL] ?? LEVELS.info;

function emit(level, scope, message, meta) {
  if (LEVELS[level] < threshold) return;
  const time = new Date().toISOString().slice(11, 19);
  const suffix = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  const line = `${time} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${suffix}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(scope) {
  return {
    debug: (message, meta) => emit("debug", scope, message, meta),
    info: (message, meta) => emit("info", scope, message, meta),
    warn: (message, meta) => emit("warn", scope, message, meta),
    error: (message, meta) => emit("error", scope, message, meta),
  };
}

export default createLogger;

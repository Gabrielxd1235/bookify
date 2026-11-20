// Structured logging for BOOKIFY (no external dependencies).
//
// Every line is one JSON object: {"ts","level","msg", ...fields}. Azure
// Container Apps sends stdout/stderr to Log Analytics, where JSON lines can be
// filtered by level, request id, route or status code.
//
// LOG_FORMAT=pretty keeps the old human-readable output for local work.
// LOG_LEVEL=debug|info|warn|error filters what is written (default info).

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };
const SERVICE = "bookify-api";

const original = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console)
};

function minLevel() {
  return LEVELS[String(process.env.LOG_LEVEL || "info").toLowerCase()] || LEVELS.info;
}

function pretty() {
  return String(process.env.LOG_FORMAT || "").toLowerCase() === "pretty";
}

// Errors become plain objects; values that cannot be serialized are dropped
function normalize(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      code: value.code,
      stack: process.env.NODE_ENV === "production" ? undefined : value.stack
    };
  }
  return value;
}

function write(level, msg, fields = {}) {
  if (LEVELS[level] < minLevel()) return;

  const stream = LEVELS[level] >= LEVELS.warn ? original.error : original.log;

  if (pretty()) {
    const extra = Object.keys(fields).length ? ` ${JSON.stringify(fields, (k, v) => normalize(v))}` : "";
    stream(`[${level.toUpperCase()}] ${msg}${extra}`);
    return;
  }

  const entry = { ts: new Date().toISOString(), level, service: SERVICE, msg: String(msg) };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) entry[key] = normalize(value);
  }

  try {
    stream(JSON.stringify(entry));
  } catch {
    stream(JSON.stringify({ ts: entry.ts, level, service: SERVICE, msg: entry.msg }));
  }
}

const logger = {
  debug: (msg, fields) => write("debug", msg, fields),
  info: (msg, fields) => write("info", msg, fields),
  warn: (msg, fields) => write("warn", msg, fields),
  error: (msg, fields) => write("error", msg, fields),
  fatal: (msg, fields) => write("fatal", msg, fields)
};

// Route the existing console.* calls through the structured logger, so code
// that still uses console.error("Something failed:", err.message) also ends
// up as one JSON line with the right level.
function installStructuredConsole() {
  if (console.__bookifyStructured) return;

  const toFields = (args) => {
    const [first, ...rest] = args;
    const msg = typeof first === "string" ? first : JSON.stringify(normalize(first));
    if (rest.length === 0) return { msg, fields: {} };
    const details = rest.map(normalize);
    return { msg, fields: { details: details.length === 1 ? details[0] : details } };
  };

  for (const [method, level] of [["log", "info"], ["info", "info"], ["warn", "warn"], ["error", "error"], ["debug", "debug"]]) {
    console[method] = (...args) => {
      const { msg, fields } = toFields(args);
      write(level, msg, fields);
    };
  }

  console.__bookifyStructured = true;
}

module.exports = { logger, installStructuredConsole };

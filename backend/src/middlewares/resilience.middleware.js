const crypto = require("node:crypto");
const { logger } = require("../utils/logger");
const { isLoadTestRequest } = require("./loadTest.middleware");

// Resilience for BOOKIFY: request ids and access logs, a hard response
// deadline, load shedding when too many requests are in flight, and clear
// "why it failed" answers for expected infrastructure errors.

const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS) || 15000;
const MAX_IN_FLIGHT = Number(process.env.MAX_IN_FLIGHT_REQUESTS) || 600;
const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS) || 1500;

const state = {
  inFlight: 0,
  peakInFlight: 0,
  shed: 0,
  timedOut: 0,
  served: 0,
  startedAt: Date.now(),
  shuttingDown: false
};

// Paths that must answer even when the server is saturated
function isProbe(req) {
  return req.path === "/api/health" || req.path === "/api/health/ready" || req.path === "/api/health/live";
}

// 1. Request id + structured access log (one JSON line per request)
function requestContext(req, res, next) {
  const incoming = req.get("x-request-id");
  req.id = incoming && /^[\w.-]{8,80}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);
  req.isLoadTest = isLoadTestRequest(req);

  const started = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    state.served += 1;

    // Health probes and successful load-test traffic would flood the log
    if (isProbe(req) && res.statusCode < 400) return;
    if (req.isLoadTest && res.statusCode < 400 && durationMs < SLOW_REQUEST_MS) return;

    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 || durationMs >= SLOW_REQUEST_MS ? "warn" : "info";

    logger[level]("http_request", {
      requestId: req.id,
      method: req.method,
      route: req.route?.path ? `${req.baseUrl || ""}${req.route.path}` : undefined,
      url: req.originalUrl.split("?")[0],
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
      slow: durationMs >= SLOW_REQUEST_MS || undefined,
      userId: req.user?.id,
      role: req.user?.role,
      loadTest: req.isLoadTest || undefined,
      inFlight: state.inFlight
    });
  });

  next();
}

// 2. Load shedding: answer 503 quickly instead of letting every request slow
//    down when the container is saturated (protects the database pool too).
function loadShedding(req, res, next) {
  if (isProbe(req)) return next();

  if (state.shuttingDown) {
    res.setHeader("Connection", "close");
    res.setHeader("Retry-After", "5");
    return res.status(503).json({
      success: false,
      reason: "SERVER_RESTARTING",
      message: "BOOKIFY is restarting for an update. Please retry in a few seconds.",
      requestId: req.id
    });
  }

  if (state.inFlight >= MAX_IN_FLIGHT) {
    state.shed += 1;
    res.setHeader("Retry-After", "2");
    logger.warn("load_shed", { requestId: req.id, inFlight: state.inFlight, limit: MAX_IN_FLIGHT, url: req.originalUrl.split("?")[0] });
    return res.status(503).json({
      success: false,
      reason: "SERVER_BUSY",
      message: "BOOKIFY is receiving too many requests right now. Please retry in a few seconds.",
      requestId: req.id
    });
  }

  state.inFlight += 1;
  state.peakInFlight = Math.max(state.peakInFlight, state.inFlight);

  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      state.inFlight -= 1;
    }
  };
  res.on("finish", release);
  res.on("close", release);

  next();
}

// 3. Response deadline: a request that has not answered in time gets a 503
//    with the reason, instead of hanging until the client gives up.
function requestTimeout(req, res, next) {
  if (isProbe(req)) return next();

  // Bulk load-test registration can legitimately take longer
  const limit = req.path === "/api/auth/register-batch" ? Math.max(REQUEST_TIMEOUT_MS, 60000) : REQUEST_TIMEOUT_MS;

  const timer = setTimeout(() => {
    if (res.headersSent) return;
    state.timedOut += 1;
    logger.error("request_timeout", { requestId: req.id, url: req.originalUrl.split("?")[0], limitMs: limit });
    res.status(503).json({
      success: false,
      reason: "TIMEOUT",
      message: `The server did not finish this request within ${Math.round(limit / 1000)} seconds. It may be overloaded or the database may be slow; please retry.`,
      requestId: req.id
    });
  }, limit);

  timer.unref();
  const clear = () => clearTimeout(timer);
  res.on("finish", clear);
  res.on("close", clear);
  next();
}

// Errors that mean "a dependency is down", not "the code is wrong"
function classifyError(err) {
  const text = `${err?.code || ""} ${err?.name || ""} ${err?.message || ""} ${err?.cause?.code || ""}`.toLowerCase();

  if (/econnrefused|enotfound|eai_again|fetch failed|network|socket hang up|econnreset|und_err/.test(text)) {
    return { status: 503, reason: "DATABASE_UNAVAILABLE", message: "BOOKIFY cannot reach its database right now. Please retry in a moment." };
  }
  if (/timeout|timed out|aborterror|etimedout|57014/.test(text)) {
    return { status: 503, reason: "DATABASE_TIMEOUT", message: "The database took too long to answer. Please retry in a moment." };
  }
  return null;
}

function stats() {
  return {
    inFlight: state.inFlight,
    peakInFlight: state.peakInFlight,
    maxInFlight: MAX_IN_FLIGHT,
    shedRequests: state.shed,
    timedOutRequests: state.timedOut,
    servedRequests: state.served,
    uptimeSeconds: Math.round((Date.now() - state.startedAt) / 1000),
    memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    requestTimeoutMs: REQUEST_TIMEOUT_MS
  };
}

function markShuttingDown() {
  state.shuttingDown = true;
}

module.exports = { requestContext, loadShedding, requestTimeout, classifyError, stats, markShuttingDown, state };

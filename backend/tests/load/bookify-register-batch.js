import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import exec from "k6/execution";

// BOOKIFY - batch registration (load tests only).
// Each iteration sends BATCH_SIZE new accounts to POST /api/auth/register-batch,
// which validates them, hashes each password and stores the whole batch with
// one database insert. Needs the load-test key (the route is 404 without it).
//
// Emails: loadtest-reg<run>-NNNNN@example.test, same pattern as
// bookify-register-users.js, so scripts/count-registered.cjs and
// sql/cleanup-load-test-users.sql work for these accounts too.

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const ACCOUNT_COUNT = Number(__ENV.ACCOUNT_COUNT || 100);
const BATCH_SIZE = Number(__ENV.BATCH_SIZE || 50);
const VUS = Number(__ENV.VUS || 20);
const REQUEST_TIMEOUT = __ENV.REQUEST_TIMEOUT || "30s";

if (!Number.isInteger(ACCOUNT_COUNT) || ACCOUNT_COUNT < 1 || ACCOUNT_COUNT > 20000) {
  throw new Error("ACCOUNT_COUNT must be between 1 and 20000");
}

if (!Number.isInteger(BATCH_SIZE) || BATCH_SIZE < 1 || BATCH_SIZE > 50) {
  throw new Error("BATCH_SIZE must be between 1 and 50");
}

if (!__ENV.LOAD_TEST_KEY) {
  throw new Error("LOAD_TEST_KEY is required: the batch route only exists for load tests");
}

const BATCHES = Math.ceil(ACCOUNT_COUNT / BATCH_SIZE);

const registeredAccounts = new Counter("bookify_registered_accounts");

export const options = {
  scenarios: {
    batch_registration: {
      executor: "shared-iterations",
      vus: Math.min(VUS, BATCHES),
      iterations: BATCHES,
      // Total time limit, e.g. MAX_DURATION=2s
      maxDuration: __ENV.MAX_DURATION || "20m",
      // GRACEFUL_STOP=0s cuts exactly at MAX_DURATION
      gracefulStop: __ENV.GRACEFUL_STOP || "30s"
    }
  },

  thresholds: {
    checks: ["rate==1"],
    http_req_failed: ["rate==0"],
    bookify_registered_accounts: [`count==${ACCOUNT_COUNT}`]
  }
};

const CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function randomPassword() {
  let value = "";
  for (let i = 0; i < 24; i++) {
    value += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return value + "Aa1!";
}

export function setup() {
  const health = http.get(`${BASE_URL}/api/health`, { timeout: "60s" });
  if (health.status !== 200) {
    exec.test.abort(
      `No se pudo contactar la API en "${BASE_URL}" (HTTP ${health.status}). ` +
      `Define $api en esta PowerShell y vuelve a ejecutar.`
    );
  }

  const runId = /^[a-z0-9]{6,24}$/.test(__ENV.RUN_ID || "")
    ? __ENV.RUN_ID
    : (
        Date.now().toString(36) +
        Math.floor(Math.random() * 1e6).toString(36)
      ).toLowerCase();

  console.log(
    `Run id: ${runId} (emails loadtest-reg${runId}-NNNNN@example.test, ` +
    `${BATCHES} lotes de hasta ${BATCH_SIZE})`
  );

  return { runId };
}

export default function (data) {
  const batch = exec.scenario.iterationInTest;
  const first = batch * BATCH_SIZE + 1;
  const last = Math.min(first + BATCH_SIZE - 1, ACCOUNT_COUNT);

  const users = [];
  for (let n = first; n <= last; n++) {
    const number = String(n).padStart(5, "0");
    users.push({
      full_name: `BOOKIFY Lote ${number}`,
      email: `loadtest-reg${data.runId}-${number}@example.test`,
      password: randomPassword()
    });
  }

  const response = http.post(
    `${BASE_URL}/api/auth/register-batch`,
    JSON.stringify({ users }),
    {
      headers: {
        "Content-Type": "application/json",
        "X-Load-Test-Key": __ENV.LOAD_TEST_KEY
      },
      tags: { operation: "register_batch" },
      timeout: REQUEST_TIMEOUT
    }
  );

  let created = 0;

  const ok = check(response, {
    "Batch returns HTTP 201": (r) => r.status === 201,
    "Batch created every account": (r) => {
      try {
        created = Number(r.json("created")) || 0;
        return created === users.length;
      } catch {
        return false;
      }
    }
  });

  registeredAccounts.add(created);

  if (!ok) {
    console.error(`Batch ${batch + 1} failed: HTTP ${response.status}`);
  }
}

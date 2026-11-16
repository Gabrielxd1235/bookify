import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";
import exec from "k6/execution";

// BOOKIFY - 5000 real registrations through the public API.
// Each iteration: POST /api/auth/register -> POST /api/auth/login ->
// GET /api/auth/me, so every account is created by the backend, stored in
// Supabase and proven usable.
//
// Emails: loadtest-reg<run>-<n>@example.test (reserved test domain). They are
// removed with backend/sql/cleanup-load-test-users.sql.
//
// Without LOAD_TEST_KEY the register limiter allows 5 accounts per hour per
// IP; with the key the limiters are skipped and the backend hashes these
// synthetic accounts with bcrypt cost 4 (real accounts keep cost 12).

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const ACCOUNT_COUNT = Number(__ENV.ACCOUNT_COUNT || 10);
const VUS = Number(__ENV.VUS || 5);
// Per-request limit: a request slower than this counts as failed
const REQUEST_TIMEOUT = __ENV.REQUEST_TIMEOUT || "30s";

if (!Number.isInteger(ACCOUNT_COUNT) || ACCOUNT_COUNT < 1 || ACCOUNT_COUNT > 10000) {
  throw new Error("ACCOUNT_COUNT must be between 1 and 10000");
}

const LOAD_TEST_HEADERS = __ENV.LOAD_TEST_KEY
  ? { "X-Load-Test-Key": __ENV.LOAD_TEST_KEY }
  : {};

const registeredAccounts = new Counter("bookify_registered_accounts");

export const options = {
  scenarios: {
    registration: {
      executor: "shared-iterations",
      vus: VUS,
      iterations: ACCOUNT_COUNT,
      // Total time limit. With MAX_DURATION=2s the test stops after 2 seconds
      // and the accounts registered so far stay in Supabase.
      maxDuration: __ENV.MAX_DURATION || "20m",
      // Extra time for in-flight iterations after maxDuration (k6 default 30s).
      // GRACEFUL_STOP=0s cuts exactly at maxDuration.
      gracefulStop: __ENV.GRACEFUL_STOP || "30s"
    }
  },

  thresholds: {
    checks: ["rate==1"],
    http_req_failed: ["rate==0"],
    bookify_registered_accounts: [`count==${ACCOUNT_COUNT}`]
  }
};

// ---- Throughput options (how many accounts fit in a short MAX_DURATION) ----
// REGISTER_ONLY=1: each VU only registers (skips login + profile), so every
//   request in the time window creates an account. Persistence is checked by
//   counting the run in Supabase instead.
// WARMUP=1: before the timed window, every VU calls /api/health once to open
//   its HTTPS connection to Azure, so the TLS handshake (~1 s on the first
//   request) is not charged to the registration window.
const REGISTER_ONLY = __ENV.REGISTER_ONLY === "1";
const WARMUP = __ENV.WARMUP === "1";

if (WARMUP) {
  options.scenarios.warmup = {
    executor: "per-vu-iterations",
    exec: "warmup",
    vus: VUS,
    iterations: 1,
    maxDuration: "20s",
    gracefulStop: "0s"
  };
  // The registration window starts after the warm-up has finished
  options.scenarios.registration.startTime = __ENV.WARMUP_TIME || "8s";
}

export function warmup() {
  http.get(`${BASE_URL}/api/health`, {
    tags: { operation: "warmup" },
    timeout: "20s"
  });
}

const CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function randomPassword() {
  let value = "";
  for (let i = 0; i < 24; i++) {
    value += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return value + "Aa1!";
}

// One run id shared by every VU, so emails never collide between runs
export function setup() {
  // RUN_ID can be fixed by the PowerShell runner to count the run afterwards
  const runId = /^[a-z0-9]{6,24}$/.test(__ENV.RUN_ID || "")
    ? __ENV.RUN_ID
    : (
        Date.now().toString(36) +
        Math.floor(Math.random() * 1e6).toString(36)
      ).toLowerCase();

  console.log(`Run id: ${runId} (emails loadtest-reg${runId}-NNNNN@example.test)`);

  return { runId };
}

export default function (data) {
  const n = exec.scenario.iterationInTest + 1;
  const number = String(n).padStart(5, "0");
  const email = `loadtest-reg${data.runId}-${number}@example.test`;
  const password = randomPassword();

  const jsonHeaders = {
    "Content-Type": "application/json",
    ...LOAD_TEST_HEADERS
  };

  // STEP 1: register a new CLIENT account
  const registerResponse = http.post(
    `${BASE_URL}/api/auth/register`,
    JSON.stringify({
      full_name: `BOOKIFY Registro ${number}`,
      email,
      password
    }),
    {
      headers: jsonHeaders,
      tags: { operation: "register" },
      timeout: REQUEST_TIMEOUT
    }
  );

  let userId = null;

  const registered = check(registerResponse, {
    "Register returns HTTP 201": (r) => r.status === 201,
    "Register returns the new user": (r) => {
      try {
        userId = r.json("user.id");
        return Boolean(userId) && r.json("user.email") === email;
      } catch {
        return false;
      }
    }
  });

  if (!registered) {
    console.error(`Register failed for ${number}: HTTP ${registerResponse.status}`);
    return;
  }

  registeredAccounts.add(1);

  if (REGISTER_ONLY) {
    return;
  }

  // STEP 2: log in with the new credentials
  const loginResponse = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({ email, password }),
    {
      headers: jsonHeaders,
      tags: { operation: "login" },
      timeout: REQUEST_TIMEOUT
    }
  );

  let accessToken = null;

  const loggedIn = check(loginResponse, {
    "Login of the new account returns HTTP 200": (r) => {
      if (r.status !== 200) return false;
      try {
        accessToken = r.json("accessToken");
        return Boolean(accessToken);
      } catch {
        return false;
      }
    }
  });

  if (!loggedIn) {
    console.error(`Login failed for new account ${number}: HTTP ${loginResponse.status}`);
    return;
  }

  // STEP 3: the profile must be the account that was just created
  const profileResponse = http.get(`${BASE_URL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...LOAD_TEST_HEADERS
    },
    tags: { operation: "profile" },
    timeout: REQUEST_TIMEOUT
  });

  check(profileResponse, {
    "Profile matches the new account": (r) => {
      if (r.status !== 200) return false;
      try {
        return Number(r.json("user.id")) === Number(userId);
      } catch {
        return false;
      }
    }
  });
}

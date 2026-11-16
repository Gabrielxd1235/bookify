import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import { Counter } from "k6/metrics";
import exec from "k6/execution";

// BOOKIFY API configuration
const BASE_URL =
  __ENV.BASE_URL || "http://localhost:3000";

const TOTAL_REQUESTS =
  Number(__ENV.TOTAL_REQUESTS || 50);

const VIRTUAL_USERS =
  Number(__ENV.VIRTUAL_USERS || 50);

// Load registered accounts from the private CSV
const accounts = new SharedArray(
  "bookify-registered-accounts",
  function () {
    const file =
      __ENV.USERS_FILE ||
      "./private/bookify-users-mwinc5qd566ff647.csv";

    const lines = open(file)
      .trim()
      .split(/\r?\n/);

    const records = lines.slice(1);

    return records
      .filter((line) => line.trim())
      .map((line) => {
        const [id, email, password] = line.split(",");

        return {
          id: Number(id),
          email,
          password
        };
      });
  }
);

if (
  !Number.isInteger(TOTAL_REQUESTS) ||
  TOTAL_REQUESTS < 1 ||
  TOTAL_REQUESTS > 5000
) {
  throw new Error(
    "TOTAL_REQUESTS must be between 1 and 5000"
  );
}

if (
  !Number.isInteger(VIRTUAL_USERS) ||
  VIRTUAL_USERS < 1 ||
  VIRTUAL_USERS > accounts.length
) {
  throw new Error(
    "VIRTUAL_USERS must not exceed available accounts"
  );
}

// Count measured API requests
const apiRequests = new Counter(
  "bookify_api_requests"
);

// Logins run in setup() in small batches so the login rate limiter
// (10 concurrent attempts per IP) is never tripped, and bcrypt runs only
// once per session instead of once per iteration.
const LOGIN_BATCH_SIZE = Number(__ENV.LOGIN_BATCH_SIZE || 5);
// Public and protected endpoints
const endpoints = [
  "/api/auth/me",
  "/api/reservations/mine",
  "/api/categories?page=1&limit=10",
  "/api/businesses?page=1&limit=10",
  "/api/services?page=1&limit=10"
];

export const options = {
  scenarios: {
    bookify_load: {
      executor: "shared-iterations",
      vus: VIRTUAL_USERS,
      iterations: TOTAL_REQUESTS,
      maxDuration: "1h"
    }
  },

  thresholds: {
    "http_req_duration{test_type:api}": [
      "p(95)<1500"
    ],

    "http_req_failed{test_type:api}": [
      "rate<0.01"
    ],

    "checks": [
      "rate>0.99"
    ]
  }
};

export function setup() {
  const sessionCount = Math.min(VIRTUAL_USERS, accounts.length);
  const tokens = [];

  for (let start = 0; start < sessionCount; start += LOGIN_BATCH_SIZE) {
    const batch = [];

    for (let i = start; i < Math.min(start + LOGIN_BATCH_SIZE, sessionCount); i++) {
      batch.push({
        method: "POST",
        url: `${BASE_URL}/api/auth/login`,
        body: JSON.stringify({
          email: accounts[i].email,
          password: accounts[i].password
        }),
        params: {
          headers: { "Content-Type": "application/json" },
          tags: { test_type: "login", operation: "authentication" },
          timeout: "15s"
        }
      });
    }

    for (const response of http.batch(batch)) {
      const loginPassed = check(response, {
        "Login HTTP 200": (r) => r.status === 200
      });

      const token = loginPassed ? response.json("accessToken") : null;

      if (!token) {
        exec.test.abort(
          `Authentication failed: HTTP ${response.status}. Aborting instead of running unauthenticated iterations.`
        );
      }

      tokens.push(token);
    }
  }

  return { tokens };
}

export default function (data) {
  // Each VU reuses the token obtained for it in setup()
  const accessToken =
    data.tokens[(exec.vu.idInTest - 1) % data.tokens.length];

  // Select the endpoint for this iteration
  const iteration =
    exec.scenario.iterationInTest;

  const endpoint =
    endpoints[iteration % endpoints.length];

  // Send one measured request
  const response = http.get(
    `${BASE_URL}${endpoint}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },

      tags: {
        test_type: "api",
        endpoint
      },

      timeout: "15s"
    }
  );

  apiRequests.add(1);

  // Verify status and response time
  check(response, {
    "API HTTP 200": (result) =>
      result.status === 200,

    "API response under 1500ms": (result) =>
      result.timings.duration < 1500
  });

  if (response.status !== 200) {
    console.error(
      `API failure: ${endpoint} | HTTP ${response.status}`
    );
  }

  sleep(0.05);
}

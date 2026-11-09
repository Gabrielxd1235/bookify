import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";
import exec from "k6/execution";

// BOOKIFY API configuration
const BASE_URL =
  __ENV.BASE_URL || "http://localhost:3000";

// Load existing Supabase test accounts
const accounts = new SharedArray(
  "bookify-registered-test-accounts",
  function () {
    const files = [
      "./private/bookify-users-mw91fx6zbda2ca64.csv",
      "./private/bookify-users-mw91jbaabc152991.csv"
    ];

    const allAccounts = [];

    for (const file of files) {
      const content = open(file);

      const lines = content
        .trim()
        .split(/\r?\n/)
        .slice(1);

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        const [id, email, password] = line.split(",");

        if (!id || !email || !password) {
          throw new Error(
            `Invalid account record in ${file}`
          );
        }

        allAccounts.push({
          id: Number(id),
          email,
          password
        });
      }
    }

    return allAccounts;
  }
);

// Number of accounts to verify
const ACCOUNT_COUNT = Number(
  __ENV.ACCOUNT_COUNT || 10
);

// Validate requested account count
if (
  !Number.isInteger(ACCOUNT_COUNT) ||
  ACCOUNT_COUNT < 1 ||
  ACCOUNT_COUNT > accounts.length
) {
  throw new Error(
    `ACCOUNT_COUNT must be between 1 and ${accounts.length}`
  );
}

// Test configuration
export const options = {
  scenarios: {
    authentication_verification: {
      executor: "shared-iterations",
      vus: 5,
      iterations: ACCOUNT_COUNT,
      maxDuration: "10m"
    }
  },

  thresholds: {
    checks: ["rate==1"],
    http_req_failed: ["rate==0"]
  }
};

// Execute one verification per registered account
export default function () {
  const index = exec.scenario.iterationInTest;

  const account = accounts[index];

  if (!account) {
    throw new Error(
      `Account not found for iteration ${index}`
    );
  }

  // STEP 1: Login with an existing account
  const loginResponse = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: account.email,
      password: account.password
    }),
    {
      headers: {
        "Content-Type": "application/json"
      },

      tags: {
        operation: "login"
      },

      timeout: "5s"
    }
  );

  const loginPassed = check(loginResponse, {
    "Login returns HTTP 200": (r) =>
      r.status === 200
  });

  if (!loginPassed) {
    console.error(
      `Login failed for account ${index + 1}: HTTP ${loginResponse.status}`
    );

    return;
  }

  let accessToken;

  try {
    const loginData = loginResponse.json();
    accessToken = loginData.accessToken;
  } catch {
    console.error(
      `Invalid login response for account ${index + 1}`
    );

    return;
  }

  if (!accessToken) {
    console.error(
      `Missing JWT for account ${index + 1}`
    );

    return;
  }

  // STEP 2: Access the authenticated profile
  const profileResponse = http.get(
    `${BASE_URL}/api/auth/me`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },

      tags: {
        operation: "profile"
      },

      timeout: "15s"
    }
  );

  check(profileResponse, {
    "Profile returns HTTP 200": (r) =>
      r.status === 200,

    "Profile matches the registered account": (r) => {
      if (r.status !== 200) {
        return false;
      }

      try {
        const responseData = r.json();

        return (
          Number(responseData.user?.id) === account.id
        );
      } catch {
        return false;
      }
    }
  });

  // STEP 3: Revoke the refresh session
  const logoutResponse = http.post(
    `${BASE_URL}/api/auth/logout`,
    null,
    {
      tags: {
        operation: "logout"
      },

      timeout: "15s"
    }
  );

  check(logoutResponse, {
    "Logout returns HTTP 200": (r) =>
      r.status === 200
  });

  sleep(0.1);
}
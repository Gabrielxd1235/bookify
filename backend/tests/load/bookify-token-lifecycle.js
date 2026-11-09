import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";

const BASE_URL =
  __ENV.BASE_URL || "http://localhost:3000";

const accounts = new SharedArray(
  "bookify-token-test-account",
  () => {
    const lines = open(
      "./private/bookify-users-mw91jbaabc152991.csv"
    )
      .trim()
      .split(/\r?\n/)
      .slice(1);

    return lines.map((line) => {
      const [id, email, password] = line.split(",");

      return {
        id: Number(id),
        email,
        password
      };
    });
  }
);

export const options = {
  scenarios: {
    token_lifecycle: {
      executor: "shared-iterations",
      vus: 1,
      iterations: 1,
      maxDuration: "1m"
    }
  },

  thresholds: {
    checks: ["rate==1"],
    dropped_iterations: ["count==0"]
  }
};

export default function () {
  const account = accounts[0];

  const jsonHeaders = {
    "Content-Type": "application/json"
  };

  // STEP 1: Login
  const login = http.post(
    `${BASE_URL}/api/auth/login`,
    JSON.stringify({
      email: account.email,
      password: account.password
    }),
    {
      headers: jsonHeaders
    }
  );

  check(login, {
    "Login is successful": (r) => r.status === 200
  });

  if (login.status !== 200) {
    return;
  }

  const accessToken = login.json("accessToken");

  if (!accessToken) {
    throw new Error("Access token was not returned");
  }

  // STEP 2: Validate the original access token
  const validAccess = http.get(
    `${BASE_URL}/api/auth/me`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  check(validAccess, {
    "Valid access token is accepted": (r) =>
      r.status === 200
  });

  // STEP 3: Allow a five-second JWT to expire
  sleep(7);

  // STEP 4: Verify that the expired JWT is rejected
  const expiredAccess = http.get(
    `${BASE_URL}/api/auth/me`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },

      // HTTP 401 is expected in this security test
      responseCallback: http.expectedStatuses(401)
    }
  );

  // Log the actual HTTP status without exposing the JWT
console.log(
  `Expired access token response: HTTP ${expiredAccess.status}`
);

  check(expiredAccess, {
    "Expired access token returns HTTP 401": (r) =>
      r.status === 401
  });

  // STEP 5: Renew the session
  // k6 retains the HttpOnly refresh cookie in its cookie jar
  const refresh = http.post(
    `${BASE_URL}/api/auth/refresh`,
    null
  );

  check(refresh, {
    "Refresh token renews the session": (r) =>
      r.status === 200
  });

  if (refresh.status !== 200) {
    return;
  }

  const renewedToken = refresh.json("accessToken");

  if (!renewedToken) {
    throw new Error("Renewed access token is missing");
  }

  // STEP 6: Validate the renewed access token
  const renewedAccess = http.get(
    `${BASE_URL}/api/auth/me`,
    {
      headers: {
        Authorization: `Bearer ${renewedToken}`
      }
    }
  );

  check(renewedAccess, {
    "Renewed access token is accepted": (r) =>
      r.status === 200
  });

  // STEP 7: Logout
  const logout = http.post(
    `${BASE_URL}/api/auth/logout`,
    null
  );

  check(logout, {
    "Logout is successful": (r) =>
      r.status === 200
  });

  // STEP 8: A revoked refresh session must not be reusable
  const refreshAfterLogout = http.post(
    `${BASE_URL}/api/auth/refresh`,
    null,
    {
      responseCallback: http.expectedStatuses(401)
    }
  );

  check(refreshAfterLogout, {
    "Refresh after logout returns HTTP 401": (r) =>
      r.status === 401
  });
}
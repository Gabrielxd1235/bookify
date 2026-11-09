import http from "k6/http";
import { check } from "k6";

// BOOKIFY API configuration
const BASE_URL =
  __ENV.BASE_URL || "http://localhost:3000";

// Load test configuration
const TOTAL_REQUESTS = Number(__ENV.TOTAL_REQUESTS || 1000);
const VIRTUAL_USERS = Number(__ENV.VIRTUAL_USERS || 10);

// Public API endpoints
const endpoints = [
  "/api/health",
  "/api/categories?page=1&limit=10",
  "/api/businesses?page=1&limit=10",
  "/api/services?page=1&limit=10"
];

export const options = {
  scenarios: {
    bookify_load_test: {
      executor: "shared-iterations",

      vus: VIRTUAL_USERS,

      iterations: TOTAL_REQUESTS,

      maxDuration: "10m"
    }
  },

  thresholds: {
    http_req_duration: ["p(95)<1500"],

    http_req_failed: ["rate<0.01"],

    checks: ["rate>0.99"]
  }
};

export default function () {
  // Select an endpoint for the current iteration
  const endpoint =
    endpoints[__ITER % endpoints.length];

  const response = http.get(
    `${BASE_URL}${endpoint}`,
    {
      tags: {
        endpoint
      },

      timeout: "15s"
    }
  );

  // Validate the response
  const success = check(response, {
    "HTTP 200": (r) => r.status === 200,

    "Response time below 1500ms": (r) =>
      r.timings.duration < 1500
  });

  // Display failed responses
  if (!success) {
    console.error(
      `Request failed: ${endpoint} | HTTP ${response.status}`
    );
  }
}
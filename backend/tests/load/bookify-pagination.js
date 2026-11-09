import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";

const BASE_URL =
  __ENV.BASE_URL || "http://localhost:3000";

const resources = [
  "/api/categories",
  "/api/businesses",
  "/api/services"
];

const pages = [1, 2, 3];

const limits = [5, 10, 20];

// Generate every combination of resource, page and limit
const combinations = [];

for (const resource of resources) {
  for (const page of pages) {
    for (const limit of limits) {
      combinations.push({
        resource,
        page,
        limit
      });
    }
  }
}

export const options = {
  scenarios: {
    pagination_verification: {
      executor: "shared-iterations",
      vus: 5,
      iterations: 108,
      maxDuration: "2m"
    }
  },

  thresholds: {
    http_req_duration: [
      "p(95)<1500"
    ],

    http_req_failed: [
      "rate==0"
    ],

    checks: [
      "rate==1"
    ],

    dropped_iterations: [
      "count==0"
    ]
  }
};

export default function () {
  const iteration =
    exec.scenario.iterationInTest;

  const combination =
    combinations[iteration % combinations.length];

  const { resource, page, limit } = combination;

  const response = http.get(
    `${BASE_URL}${resource}?page=${page}&limit=${limit}`,
    {
      tags: {
        resource,
        page: String(page),
        limit: String(limit)
      },

      timeout: "15s"
    }
  );

  check(response, {
    "Pagination returns HTTP 200": (r) =>
      r.status === 200,

    "Pagination responds within 1500ms": (r) =>
      r.timings.duration < 1500,

    "Pagination returns valid JSON": (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    }
  });

  if (response.status !== 200) {
    console.error(
      `Pagination failed: ${resource}, page=${page}, limit=${limit}, status=${response.status}`
    );
  }
}
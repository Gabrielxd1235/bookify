
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 10,
  duration: "10s",
  thresholds: {
    http_req_duration: ["p(95)<1000"],
    checks: ["rate>0.95"],
  },
};

export default function () {
  const response = http.get("http://localhost:3000/api/health");

  check(response, {
    "HTTP 200": (r) => r.status === 200,
  });

  if (response.status !== 200) {
    console.log(
      `ERROR HTTP ${response.status}: ${String(response.body).slice(0, 150)}`
    );
  }

  sleep(1);
}

const test = require("node:test");
const assert = require("node:assert/strict");

// Configure a dedicated test environment
process.env.NODE_ENV = "test";
process.env.RATE_LIMIT_WINDOW_MS = "5000";
process.env.RATE_LIMIT_MAX = "3";

const app = require("../src/app");

let server;
let baseURL;

// Start an isolated server
test.before(async () => {
  server = await new Promise((resolve) => {
    const instance = app.listen(
      0,
      "127.0.0.1",
      () => resolve(instance)
    );
  });

  baseURL = `http://127.0.0.1:${server.address().port}`;
});

// Stop the isolated server
test.after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
});

// TEST 1: Allow the first three requests
test("Rate limiter allows the first three requests", async () => {
  const statuses = [];

  for (let i = 0; i < 3; i++) {
    const response = await fetch(
      `${baseURL}/api/health`
    );

    statuses.push(response.status);
  }

  assert.deepEqual(statuses, [200, 200, 200]);
});

// TEST 2: Reject requests above the limit
test("Rate limiter blocks the fourth request", async () => {
  const response = await fetch(
    `${baseURL}/api/health`
  );

  const body = await response.json();

  assert.equal(response.status, 429);
  assert.equal(body.success, false);
});

// TEST 3: Return rate limiting headers
test("Rate limiter includes rate limit headers", async () => {
  const response = await fetch(
    `${baseURL}/api/health`
  );

  assert.equal(response.status, 429);

  assert.ok(
    response.headers.has("ratelimit")
  );
});

// TEST 4: Reset the limit after the time window
test("Rate limiter resets after five seconds", async () => {
  await new Promise((resolve) =>
    setTimeout(resolve, 5500)
  );

  const response = await fetch(
    `${baseURL}/api/health`
  );

  assert.equal(response.status, 200);
});
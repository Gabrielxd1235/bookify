const test = require("node:test");
const assert = require("node:assert/strict");

// Use the test environment
process.env.NODE_ENV = "test";

const app = require("../src/app");

let server;
let baseURL;

// Start an isolated HTTP server
test.before(async () => {
  server = await new Promise((resolve) => {
    const instance = app.listen(
      0,
      "127.0.0.1",
      () => resolve(instance)
    );
  });

  const address = server.address();

  baseURL = `http://127.0.0.1:${address.port}`;
});

// Close the HTTP server
test.after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
});

// TEST 1
test("Health endpoint returns HTTP 200", async () => {
  const response = await fetch(
    `${baseURL}/api/health`
  );

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.status, "OK");
});

// TEST 2
test("Unknown API routes return HTTP 404", async () => {
  const response = await fetch(
    `${baseURL}/api/unknown-bookify-route`
  );

  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.success, false);
  assert.equal(body.message, "Route not found");
});

// TEST 3
test("Protected routes require authentication", async () => {
  const response = await fetch(
    `${baseURL}/api/auth/me`
  );

  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.success, false);
});

// TEST 4
test("Invalid JWTs are rejected", async () => {
  const response = await fetch(
    `${baseURL}/api/auth/me`,
    {
      headers: {
        Authorization: "Bearer invalid.jwt.token"
      }
    }
  );

  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.success, false);
});

// TEST 5
test("Admin routes require authentication", async () => {
  const response = await fetch(
    `${baseURL}/api/admin/users`
  );

  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.success, false);
});

// TEST 6
test("Registration validates required fields", async () => {
  const response = await fetch(
    `${baseURL}/api/auth/register`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        full_name: "",
        email: "",
        password: ""
      })
    }
  );

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
});

// TEST 7
test("Login validates required fields", async () => {
  const response = await fetch(
    `${baseURL}/api/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    }
  );

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
});

// TEST 8
test("Refresh requires a refresh token", async () => {
  const response = await fetch(
    `${baseURL}/api/auth/refresh`,
    {
      method: "POST"
    }
  );

  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.success, false);
});

// TEST 9
test("Invalid JSON returns HTTP 400", async () => {
  const response = await fetch(
    `${baseURL}/api/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: '{"email":'
    }
  );

  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
});

// TEST 10
test("Oversized JSON returns HTTP 413", async () => {
  const response = await fetch(
    `${baseURL}/api/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        data: "x".repeat(20000)
      })
    }
  );

  const body = await response.json();

  assert.equal(response.status, 413);
  assert.equal(body.success, false);
});

// TEST 11
test("CORS allows the configured frontend", async () => {
  const origin =
    process.env.FRONTEND_URL || "http://localhost:5173";

  const response = await fetch(
    `${baseURL}/api/health`,
    {
      headers: {
        Origin: origin
      }
    }
  );

  assert.equal(response.status, 200);

  assert.equal(
    response.headers.get(
      "access-control-allow-origin"
    ),
    origin
  );

  assert.equal(
    response.headers.get(
      "access-control-allow-credentials"
    ),
    "true"
  );
});

// TEST 12
test("CORS does not authorize unexpected origins", async () => {
  const response = await fetch(
    `${baseURL}/api/health`,
    {
      headers: {
        Origin: "https://untrusted.example"
      }
    }
  );

  assert.equal(
    response.headers.get(
      "access-control-allow-origin"
    ),
    null
  );
});

// TEST 13
test("CORS supports allowed preflight requests", async () => {
  const origin =
    process.env.FRONTEND_URL || "http://localhost:5173";

  const response = await fetch(
    `${baseURL}/api/auth/login`,
    {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type"
      }
    }
  );

  assert.equal(response.status, 204);

  assert.equal(
    response.headers.get(
      "access-control-allow-origin"
    ),
    origin
  );
});

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  requireRole
} = require("../src/middlewares/role.middleware");

// Mock an HTTP response without starting Express
function mockResponse() {
  return {
    statusCode: 200,
    body: null,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(data) {
      this.body = data;
      return this;
    }
  };
}

// TEST 1: unauthenticated user
test("Rejects requests without a user with HTTP 401", () => {
  const req = {};
  const res = mockResponse();
  let called = false;

  requireRole("ADMIN")(req, res, () => {
    called = true;
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
  assert.equal(called, false);
});

// TEST 2: client without administrator permissions
test("CLIENT cannot access ADMIN resources", () => {
  const req = { user: { role: "CLIENT" } };
  const res = mockResponse();
  let called = false;

  requireRole("ADMIN")(req, res, () => {
    called = true;
  });

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.success, false);
  assert.equal(called, false);
});

// TEST 3: authorized client
test("CLIENT can access its resource", () => {
  const req = { user: { role: "CLIENT" } };
  const res = mockResponse();
  let called = false;

  requireRole("CLIENT")(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
});

// TEST 4: authorized administrator
test("ADMIN can access its resource", () => {
  const req = { user: { role: "ADMIN" } };
  const res = mockResponse();
  let called = false;

  requireRole("ADMIN")(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
});

// TEST 5: business owner without administrator permissions
test("BUSINESS_OWNER cannot access ADMIN resources", () => {
  const req = { user: { role: "BUSINESS_OWNER" } };
  const res = mockResponse();
  let called = false;

  requireRole("ADMIN")(req, res, () => {
    called = true;
  });

  assert.equal(res.statusCode, 403);
  assert.equal(called, false);
});

// TEST 6: authorization for multiple roles
test("Allows CLIENT and BUSINESS_OWNER when authorized", () => {
  const req = { user: { role: "BUSINESS_OWNER" } };
  const res = mockResponse();
  let called = false;

  requireRole("CLIENT", "BUSINESS_OWNER")(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
});

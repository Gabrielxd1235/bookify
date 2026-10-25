
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  requireRole
} = require("../src/middlewares/role.middleware");

// Simular una respuesta HTTP sin iniciar Express
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

// PRUEBA 1: usuario sin autenticación
test("Rechaza solicitudes sin usuario con HTTP 401", () => {
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

// PRUEBA 2: cliente sin permisos de administrador
test("CLIENT no puede acceder a ADMIN", () => {
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

// PRUEBA 3: cliente autorizado
test("CLIENT puede acceder a su recurso", () => {
  const req = { user: { role: "CLIENT" } };
  const res = mockResponse();
  let called = false;

  requireRole("CLIENT")(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
});

// PRUEBA 4: administrador autorizado
test("ADMIN puede acceder a su recurso", () => {
  const req = { user: { role: "ADMIN" } };
  const res = mockResponse();
  let called = false;

  requireRole("ADMIN")(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
});

// PRUEBA 5: propietario sin permisos administrativos
test("BUSINESS_OWNER no puede acceder a ADMIN", () => {
  const req = { user: { role: "BUSINESS_OWNER" } };
  const res = mockResponse();
  let called = false;

  requireRole("ADMIN")(req, res, () => {
    called = true;
  });

  assert.equal(res.statusCode, 403);
  assert.equal(called, false);
});

// PRUEBA 6: autorización para varios roles
test("Permite CLIENT y BUSINESS_OWNER cuando están autorizados", () => {
  const req = { user: { role: "BUSINESS_OWNER" } };
  const res = mockResponse();
  let called = false;

  requireRole("CLIENT", "BUSINESS_OWNER")(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
});

const crypto = require("node:crypto");

// Load-test bypass for rate limiters.
// Active only when the server has LOAD_TEST_KEY set (32+ characters) AND the
// request sends the same value in the X-Load-Test-Key header. Without the
// environment variable this always returns false, so production behaves
// exactly as before. Remove LOAD_TEST_KEY from the server after the test.
const MIN_KEY_LENGTH = 32;

function isLoadTestRequest(req) {
  const expected = process.env.LOAD_TEST_KEY;

  if (!expected || expected.length < MIN_KEY_LENGTH) {
    return false;
  }

  const provided = req.get("x-load-test-key");

  if (typeof provided !== "string" || !provided) {
    return false;
  }

  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();

  return crypto.timingSafeEqual(a, b);
}

module.exports = { isLoadTestRequest };

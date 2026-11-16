const crypto = require("node:crypto");

// Load-test bypass for rate limiters.
// A request skips the limiters only when its X-Load-Test-Key header hashes
// (SHA-256) to the expected fingerprint. Only the fingerprint is stored here,
// never the key: the key is 40 random characters, so the hash cannot be
// reversed. The bypass skips rate limits only; login still needs the correct
// email and password and every token is still verified.
//
// Expected fingerprint, in order of precedence:
//   1. LOAD_TEST_KEY      (plain key set on the server)
//   2. LOAD_TEST_KEY_SHA256 (fingerprint set on the server)
//   3. DEFAULT_KEY_SHA256 (built-in fingerprint)
// Set LOAD_TEST_KEY_SHA256=off on the server to disable the bypass entirely.
const DEFAULT_KEY_SHA256 =
  "4bc89fef51ed5fe2bd8e60db0ec1eb8071f3dc9d296a0a34e5a7753272a19813";

const MIN_KEY_LENGTH = 32;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest();
}

function expectedFingerprint() {
  const plain = process.env.LOAD_TEST_KEY;

  if (plain) {
    return plain.length >= MIN_KEY_LENGTH ? sha256(plain) : null;
  }

  const hex = (
    process.env.LOAD_TEST_KEY_SHA256 || DEFAULT_KEY_SHA256
  ).trim().toLowerCase();

  return /^[0-9a-f]{64}$/.test(hex) ? Buffer.from(hex, "hex") : null;
}

function isLoadTestRequest(req) {
  const provided = req.get("x-load-test-key");

  if (typeof provided !== "string" || provided.length < MIN_KEY_LENGTH) {
    return false;
  }

  const expected = expectedFingerprint();

  if (!expected) {
    return false;
  }

  return crypto.timingSafeEqual(sha256(provided), expected);
}

module.exports = { isLoadTestRequest };

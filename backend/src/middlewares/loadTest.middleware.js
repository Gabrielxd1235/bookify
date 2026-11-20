const crypto = require("node:crypto");

// Load-test bypass for rate limiters.
// A request skips the limiters only when its X-Load-Test-Key header hashes
// (SHA-256) to one of the accepted fingerprints. Only fingerprints are stored
// here, never keys: each key is 40 random characters, so a hash cannot be
// reversed. The bypass skips rate limits only; login still needs the correct
// email and password and every token is still verified.
//
// Accepted fingerprints, in order of precedence:
//   1. LOAD_TEST_KEY        (plain key set on the server; only that key works)
//   2. LOAD_TEST_KEY_SHA256 (one or more fingerprints, comma separated)
//   3. DEFAULT_KEY_SHA256   (built-in fingerprints: team key + QA key)
// Set LOAD_TEST_KEY_SHA256=off on the server to disable the bypass entirely.
const DEFAULT_KEY_SHA256 = [
  "4bc89fef51ed5fe2bd8e60db0ec1eb8071f3dc9d296a0a34e5a7753272a19813",
  "f09044d56b4a9f188918f1e5c284dbe03c38ef2ea8ff5d57169cb8812830666f"
];

const MIN_KEY_LENGTH = 32;

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest();
}

function expectedFingerprints() {
  const plain = process.env.LOAD_TEST_KEY;

  if (plain) {
    return plain.length >= MIN_KEY_LENGTH ? [sha256(plain)] : [];
  }

  const configured = process.env.LOAD_TEST_KEY_SHA256;
  const list = configured ? configured.split(",") : DEFAULT_KEY_SHA256;

  return list
    .map((hex) => hex.trim().toLowerCase())
    .filter((hex) => /^[0-9a-f]{64}$/.test(hex))
    .map((hex) => Buffer.from(hex, "hex"));
}

function isLoadTestRequest(req) {
  const provided = req.get("x-load-test-key");

  if (typeof provided !== "string" || provided.length < MIN_KEY_LENGTH) {
    return false;
  }

  const hashed = sha256(provided);

  // Compare against every fingerprint in constant time
  return expectedFingerprints().reduce(
    (match, expected) => crypto.timingSafeEqual(hashed, expected) || match,
    false
  );
}

module.exports = { isLoadTestRequest };

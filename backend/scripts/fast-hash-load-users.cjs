require("dotenv").config();

// Re-hashes ONLY the k6 load-test accounts (loadtest-*@example.test) with a
// low bcrypt cost so each login takes ~1 ms of CPU instead of ~500 ms on the
// Azure container. Passwords do not change: k6 still performs a real login
// (bcrypt.compare + JWT + refresh session) for every account.
//
// Usage (from backend/):
//   node scripts/fast-hash-load-users.cjs            -> cost 4 (fast)
//   node scripts/fast-hash-load-users.cjs --rounds 12 -> restore normal cost

const fs = require("node:fs");
const path = require("node:path");

const bcrypt = require("bcrypt");
const supabase = require("../src/config/supabase");

const roundsArg = process.argv.indexOf("--rounds");
const ROUNDS = roundsArg > -1 ? Number(process.argv[roundsArg + 1]) : 4;
const CONCURRENCY = 25;
const LOAD_TEST_EMAIL = /^loadtest-[a-z0-9]+-\d{5}@example\.test$/;

if (!Number.isInteger(ROUNDS) || ROUNDS < 4 || ROUNDS > 14) {
  console.error("--rounds must be an integer between 4 and 14");
  process.exit(1);
}

const privateDir = path.join(__dirname, "../tests/load/private");

function readAccounts() {
  const files = fs
    .readdirSync(privateDir)
    .filter((f) => /^bookify-users-.*\.csv$/.test(f));

  const byEmail = new Map();

  for (const file of files) {
    const lines = fs
      .readFileSync(path.join(privateDir, file), "utf8")
      .trim()
      .split(/\r?\n/)
      .slice(1);

    for (const line of lines) {
      const [id, email, password] = line.split(",");
      if (!id || !email || !password) continue;
      if (!LOAD_TEST_EMAIL.test(email)) {
        throw new Error(`Refusing non load-test account: ${email}`);
      }
      byEmail.set(email, { id: Number(id), email, password });
    }
  }

  return [...byEmail.values()];
}

async function updateOne(account) {
  const hash = await bcrypt.hash(account.password, ROUNDS);

  const { data, error } = await supabase
    .from("users")
    .update({ password_hash: hash })
    .eq("id", account.id)
    .eq("email", account.email)
    .like("email", "loadtest-%@example.test")
    .select("id");

  if (error) throw new Error(`${account.email}: ${error.message}`);
  return data?.length === 1;
}

async function main() {
  const accounts = readAccounts();

  console.log(`\nBOOKIFY - load-test hash cost -> ${ROUNDS}`);
  console.log(`Accounts in CSV files: ${accounts.length}`);

  let updated = 0;
  let missing = 0;
  let next = 0;

  async function worker() {
    while (next < accounts.length) {
      const account = accounts[next++];
      if (await updateOne(account)) updated++;
      else missing++;

      const done = updated + missing;
      if (done % 500 === 0) {
        console.log(`${done}/${accounts.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(`\nUpdated: ${updated}   Not found: ${missing}`);
  if (missing > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exitCode = 1;
});

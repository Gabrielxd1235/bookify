require("dotenv").config();

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const bcrypt = require("bcrypt");
const supabase = require("../src/config/supabase");

// BOOKIFY load test configuration
const TOTAL_USERS = Number(process.argv[2] || 1000);
const BATCH_SIZE = 50;
const BCRYPT_ROUNDS = 12;

// Validate requested account count
if (
  !Number.isSafeInteger(TOTAL_USERS) ||
  TOTAL_USERS < 1 ||
  TOTAL_USERS > 5000
) {
  console.error(
    "Invalid account count. Enter a number between 1 and 5000."
  );

  process.exit(1);
}

// Generate a unique identifier for this test batch
const RUN_ID =
  Date.now().toString(36) +
  crypto.randomBytes(4).toString("hex");

// Store credentials outside tracked source files
const OUTPUT_DIR = path.join(
  __dirname,
  "../tests/load/private"
);

const OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  `bookify-users-${RUN_ID}.csv`
);

// Generate a secure random password
function generatePassword() {
  return crypto.randomBytes(20).toString("base64url") + "Aa1!";
}

// Generate a unique test email
function generateEmail(index) {
  const number = String(index).padStart(5, "0");

  return `loadtest-${RUN_ID}-${number}@example.test`;
}

// Create a test user
async function createUserData(index) {
  const number = String(index).padStart(5, "0");

  const email = generateEmail(index);
  const password = generatePassword();

  const passwordHash = await bcrypt.hash(
    password,
    BCRYPT_ROUNDS
  );

  return {
    database: {
      full_name: `BOOKIFY Load Test ${number}`,
      email,
      password_hash: passwordHash,
      role: "CLIENT",
      is_active: true
    },

    credentials: {
      email,
      password
    }
  };
}

// Create users in batches
async function seedUsers() {
  console.log("\nBOOKIFY - SUPABASE USER SEEDER");
  console.log("--------------------------------");

  console.log("Requested users:", TOTAL_USERS);
  console.log("Batch size:", BATCH_SIZE);
  console.log("Test batch ID:", RUN_ID);

  fs.mkdirSync(OUTPUT_DIR, {
    recursive: true
  });

  // Initialize the credentials file
  fs.writeFileSync(
    OUTPUT_FILE,
    "id,email,password\n",
    {
      flag: "wx",
      mode: 0o600
    }
  );

  let createdUsers = 0;
  let completedBatches = 0;

  for (
    let start = 1;
    start <= TOTAL_USERS;
    start += BATCH_SIZE
  ) {
    const end = Math.min(
      start + BATCH_SIZE - 1,
      TOTAL_USERS
    );

    const userData = await Promise.all(
      Array.from(
        { length: end - start + 1 },
        (_, offset) => createUserData(start + offset)
      )
    );

    const databaseUsers = userData.map(
      (item) => item.database
    );

    // Insert users directly into Supabase
    const { data, error } = await supabase
      .from("users")
      .insert(databaseUsers)
      .select("id, email");

    if (error) {
      console.error("\nDatabase insertion failed");
      console.error("Error:", error.message);
      console.error("Failed batch:", completedBatches + 1);
      console.error("Users already created:", createdUsers);

      process.exitCode = 1;
      return;
    }

    if (!data || data.length !== userData.length) {
      console.error("Unexpected database response.");

      process.exitCode = 1;
      return;
    }

    // Match returned IDs with generated credentials
    const idsByEmail = new Map(
      data.map((user) => [user.email, user.id])
    );

    const csvRows = userData.map((item) => {
      const id = idsByEmail.get(item.credentials.email);

      return [
        id,
        item.credentials.email,
        item.credentials.password
      ].join(",");
    });

    // Save credentials for authenticated k6 tests
    fs.appendFileSync(
      OUTPUT_FILE,
      csvRows.join("\n") + "\n"
    );

    createdUsers += data.length;
    completedBatches++;

    console.log(
      `Batch ${completedBatches}: ${createdUsers}/${TOTAL_USERS} users created`
    );
  }

  console.log("\n--------------------------------");
  console.log("BOOKIFY USER SEEDING COMPLETED");

  console.log("Created users:", createdUsers);
  console.log("Role: CLIENT");
  console.log("Accounts active: YES");

  console.log("\nCredentials saved to:");
  console.log(OUTPUT_FILE);

  console.log("\nTest batch ID:");
  console.log(RUN_ID);
}

seedUsers().catch((error) => {
  console.error("Unexpected error:", error.message);
  process.exitCode = 1;
});
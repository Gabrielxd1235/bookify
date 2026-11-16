require("dotenv").config({ quiet: true });

// Counts the accounts that one k6 registration run left in Supabase.
// Usage: node scripts/count-registered.cjs <runId> [windowSeconds]
const supabase = require("../src/config/supabase");

const runId = process.argv[2] || "";
const windowSeconds = Number(process.argv[3] || 0);

if (!/^[a-z0-9]{6,24}$/.test(runId)) {
  console.error("Usage: node scripts/count-registered.cjs <runId> [windowSeconds]");
  process.exit(1);
}

const pattern = `loadtest-reg${runId}-%@example.test`;

async function main() {
  const { count, error } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .like("email", pattern);

  if (error) throw new Error(error.message);

  console.log(`Guardadas en Supabase:     ${count}`);

  if (!count) return;

  const { data: first, error: firstError } = await supabase
    .from("users")
    .select("created_at")
    .like("email", pattern)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (firstError) throw new Error(firstError.message);

  const { data: last, error: lastError } = await supabase
    .from("users")
    .select("created_at")
    .like("email", pattern)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (lastError) throw new Error(lastError.message);

  const t0 = new Date(first.created_at);
  const seconds = (new Date(last.created_at) - t0) / 1000;
  console.log(`Primera a ultima:          ${seconds.toFixed(2)} s`);

  if (windowSeconds > 0) {
    const limit = new Date(t0.getTime() + windowSeconds * 1000).toISOString();
    const { count: inWindow, error: windowError } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .like("email", pattern)
      .lt("created_at", limit);

    if (windowError) throw new Error(windowError.message);
    console.log(`Guardadas en los primeros ${windowSeconds} s: ${inWindow}`);
  }
}

main().catch((error) => {
  console.error("Error:", error.message);
  process.exitCode = 1;
});

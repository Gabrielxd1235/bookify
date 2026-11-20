
const { createClient } = require("@supabase/supabase-js");

// Private backend credentials
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

// Validate configuration before connecting
if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials in .env");
}

// Every database call gets a deadline, so a slow or unreachable Supabase
// fails fast with a clear error instead of holding the request open.
const DB_TIMEOUT_MS = Number(process.env.DB_TIMEOUT_MS) || 10000;

function fetchWithTimeout(input, init = {}) {
  const deadline = AbortSignal.timeout(DB_TIMEOUT_MS);
  const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
  return fetch(input, { ...init, signal });
}

// Server-only Supabase client
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  },
  global: {
    fetch: fetchWithTimeout
  }
});

module.exports = supabase;

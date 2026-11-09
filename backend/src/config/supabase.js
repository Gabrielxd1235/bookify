
const { createClient } = require("@supabase/supabase-js");

// Private backend credentials
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

// Validate configuration before connecting
if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase credentials in .env");
}

// Server-only Supabase client
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

module.exports = supabase;

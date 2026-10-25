
const { createClient } = require("@supabase/supabase-js");

// Credenciales privadas del backend
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

// Verificar la configuración antes de conectarnos
if (!supabaseUrl || !supabaseKey) {
  throw new Error("Faltan las credenciales de Supabase en .env");
}

// Cliente de Supabase, exclusivo del servidor
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

module.exports = supabase;

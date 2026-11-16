// Short-lived in-memory cache of verified users for the auth middleware.
// Saves one Supabase round trip per authenticated request. Writes that change
// a user's role, status or profile must call clearUserCache(); the TTL bounds
// staleness across multiple server instances.
const TTL_MS = Number(process.env.AUTH_USER_CACHE_TTL_MS ?? 10000);
const MAX_ENTRIES = 10000;

// id -> { user, expiresAt } | { pending: Promise }
const entries = new Map();

async function getCachedUser(id, loader) {
  const key = String(id);

  if (TTL_MS <= 0) return loader();

  const entry = entries.get(key);

  if (entry?.pending) return entry.pending;

  if (entry && entry.expiresAt > Date.now()) {
    return { data: entry.user, error: null };
  }

  // Deduplicate concurrent lookups for the same user
  const pending = loader().then(
    (result) => {
      if (entries.get(key)?.pending !== pending) return result;

      if (result.error) {
        entries.delete(key);
      } else {
        if (entries.size >= MAX_ENTRIES) {
          entries.delete(entries.keys().next().value);
        }

        entries.set(key, {
          user: result.data,
          expiresAt: Date.now() + TTL_MS
        });
      }

      return result;
    },
    (error) => {
      if (entries.get(key)?.pending === pending) entries.delete(key);
      throw error;
    }
  );

  entries.set(key, { pending });

  return pending;
}

function clearUserCache() {
  entries.clear();
}

module.exports = { getCachedUser, clearUserCache };

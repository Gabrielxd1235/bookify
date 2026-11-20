-- BOOKIFY 006 - Prefix index on users.email
-- Load-test runs are counted and cleaned with LIKE 'loadtest-reg<run>-%'. The
-- existing unique index cannot serve LIKE prefixes, so counting 500 000 rows
-- hit the statement timeout. text_pattern_ops makes those prefix filters use
-- an index. Additive and idempotent.
CREATE INDEX IF NOT EXISTS idx_users_email_prefix
  ON public.users (email text_pattern_ops);

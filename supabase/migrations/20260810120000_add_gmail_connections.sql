-- Adds durable, encrypted server-side storage for a Gmail OAuth
-- connection. Previously, Gmail access/refresh tokens lived only in
-- browser httpOnly session cookies (see app/api/auth/gmail/callback
-- /route.ts) — lost on browser close, unusable outside a request
-- initiated from that same browser, and never available to a
-- server-side sync path with no browser present.
--
-- Only one row is expected per connected Gmail account for this
-- slice. There is no user/org ownership model in this application
-- yet (see CLAUDE.md Known Gaps), so this table intentionally has no
-- foreign key to any account/user table.
--
-- Security:
-- - encrypted_refresh_token is NEVER stored in plaintext. It is
--   encrypted with AES-256-GCM before insert/update — see
--   lib/googleTokenCrypto.ts. The stored value encodes the IV, GCM
--   auth tag, and ciphertext together.
-- - Access tokens are NEVER persisted here — they are short-lived and
--   are re-derived on demand from the encrypted refresh token via
--   google-auth-library's automatic refresh.
-- - This table must only ever be read/written using the privileged
--   server-side Supabase client (service role), never the anon
--   client, and must never be exposed through a client-facing route.
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before the application code that depends on
-- this table will function against a real database.

CREATE TABLE public.gmail_connections (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    google_account_email text NOT NULL,
    encrypted_refresh_token text NOT NULL,
    last_history_id text,
    watch_expiration timestamp with time zone,
    connected_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT gmail_connections_pkey PRIMARY KEY (id),
    CONSTRAINT gmail_connections_google_account_email_key UNIQUE (google_account_email)
);

COMMENT ON TABLE public.gmail_connections IS
    'Durable, encrypted Gmail OAuth connection state. Refresh tokens are encrypted at rest (AES-256-GCM, see lib/googleTokenCrypto.ts); access tokens are never persisted here.';

COMMENT ON COLUMN public.gmail_connections.encrypted_refresh_token IS
    'AES-256-GCM ciphertext (IV || authTag || ciphertext, base64-encoded). Never store or log the plaintext refresh token.';

COMMENT ON COLUMN public.gmail_connections.last_history_id IS
    'The Gmail historyId cursor to pass as startHistoryId on the next incremental sync (gmail.users.history.list). Null until the first sync completes.';

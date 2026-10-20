-- Shared across API processes. Identifiers are SHA-256 digests, not raw IPs or addresses.
CREATE TABLE auth_rate_buckets (
  bucket_key text PRIMARY KEY CHECK (bucket_key ~ '^[0-9a-f]{64}$'),
  hits integer NOT NULL CHECK (hits > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_rate_bucket_expiry ON auth_rate_buckets(expires_at);
CREATE TABLE auth_maintenance (
  id integer PRIMARY KEY CHECK (id = 1),
  cleaned_at timestamptz NOT NULL
);
INSERT INTO auth_maintenance (id, cleaned_at) VALUES (1, '1970-01-01T00:00:00Z');

-- 018_credentials_encrypted_to_text.sql
-- Fixes a type mismatch introduced in 014. The `credentials_encrypted`
-- column was modeled as BYTEA but the application stores and reads it
-- as a base64 string produced by the encrypt_credentials RPC. Reading a
-- BYTEA via supabase-js returns the value as a `\x<hex>` string
-- (Postgres' default escape format), and passing that back through
-- decode(..., 'base64') inside decrypt_credentials fails on the leading
-- backslash with `invalid symbol "\\" found while decoding base64
-- sequence`.
--
-- The fix: switch the column to TEXT (which matches what the value
-- actually is). The USING clause recovers any existing rows — the
-- application originally wrote a base64 string and PostgREST stored its
-- raw UTF-8 bytes into the BYTEA column, so converting back to UTF-8
-- returns the original string. The integration keeps working without a
-- forced reconnect.

ALTER TABLE org_integrations
  ALTER COLUMN credentials_encrypted TYPE TEXT
  USING convert_from(credentials_encrypted, 'UTF8');

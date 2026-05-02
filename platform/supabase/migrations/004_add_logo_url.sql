-- Add logo_url column to organizations table
ALTER TABLE organizations ADD COLUMN logo_url TEXT;

-- Note: You need to create a Supabase Storage bucket named 'organization-logos' manually
-- in the Supabase Dashboard with public access enabled for logo uploads to work.


-- Create storage buckets used by avatar and organization logo uploads.
-- Previously these had to be created manually in the Supabase dashboard,
-- which silently broke upload flows on fresh environments.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('user-avatars', 'user-avatars', true),
  ('organization-logos', 'organization-logos', true)
ON CONFLICT (id) DO NOTHING;

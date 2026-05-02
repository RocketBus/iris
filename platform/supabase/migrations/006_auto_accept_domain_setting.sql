-- Initialize auto-accept domain member settings on existing organizations
UPDATE organizations
SET settings = jsonb_set(
  COALESCE(settings, '{}'::jsonb),
  '{autoAcceptDomainMembers}',
  jsonb_build_object(
    'enabled', false,
    'domain', COALESCE(settings->'autoAcceptDomainMembers'->>'domain', NULL)
  ),
  true
)
WHERE settings IS NULL
   OR settings->'autoAcceptDomainMembers' IS NULL
   OR settings->'autoAcceptDomainMembers'->>'enabled' IS NULL;



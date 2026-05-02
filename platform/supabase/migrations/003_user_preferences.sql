-- Add user preferences and theme settings
ALTER TABLE users ADD COLUMN preferences JSONB DEFAULT '{"language": "pt-BR", "theme": "system"}';
ALTER TABLE users ADD COLUMN theme_preference TEXT DEFAULT 'system' CHECK (theme_preference IN ('light', 'dark', 'system'));

-- Add MFA fields for mock implementation
ALTER TABLE users ADD COLUMN mfa_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN mfa_secret TEXT;
ALTER TABLE users ADD COLUMN mfa_backup_codes TEXT[];

-- Create index for preferences
CREATE INDEX idx_users_preferences ON users USING GIN (preferences);


-- Add authentication fields to users table
ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN email_verification_token TEXT UNIQUE;
ALTER TABLE users ADD COLUMN email_verification_expires TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN password_reset_token TEXT UNIQUE;
ALTER TABLE users ADD COLUMN password_reset_expires TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN two_factor_secret TEXT;
ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN two_factor_backup_codes TEXT[];
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TIMESTAMP WITH TIME ZONE;

-- Create indexes for authentication fields
CREATE INDEX idx_users_email_verification_token ON users(email_verification_token);
CREATE INDEX idx_users_password_reset_token ON users(password_reset_token);

-- Create sessions table for NextAuth database sessions
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token TEXT UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for sessions table
CREATE INDEX idx_sessions_session_token ON sessions(session_token);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- Create two_factor_codes table for 2FA codes
CREATE TABLE two_factor_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for two_factor_codes table
CREATE INDEX idx_two_factor_codes_user_id ON two_factor_codes(user_id);
CREATE INDEX idx_two_factor_codes_expires_at ON two_factor_codes(expires_at);

-- Add updated_at trigger for sessions table
CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

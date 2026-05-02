-- Create refresh_tokens table for microservice authentication
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    revoked_at TIMESTAMP WITH TIME ZONE,
    
    -- Ensure token is unique and not revoked
    CONSTRAINT refresh_tokens_token_unique UNIQUE (token)
);

-- Create indexes for better performance
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Create index for active tokens (not revoked and not expired)
CREATE INDEX idx_refresh_tokens_active ON refresh_tokens(user_id, expires_at) 
WHERE revoked_at IS NULL;

-- Enable Row Level Security
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies for refresh_tokens
-- Users can only see their own refresh tokens
CREATE POLICY "Users can view their own refresh tokens" ON refresh_tokens
    FOR SELECT USING (user_id = auth.uid()::text::uuid);

-- Users cannot insert their own refresh tokens (only system can)
-- This is handled by service role in the API routes

-- Users cannot update refresh tokens
-- Only system can revoke tokens via service role


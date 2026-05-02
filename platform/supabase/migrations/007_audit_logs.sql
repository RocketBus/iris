-- Create audit_logs table to capture organization activity
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Useful indexes for querying logs
CREATE INDEX idx_audit_logs_org_created_at ON audit_logs (organization_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor_created_at ON audit_logs (actor_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs (action);

-- Enable RLS and allow organization members to read their logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organization members can view audit logs" ON audit_logs
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id
            FROM organization_members
            WHERE user_id = auth.uid()::text::uuid
              AND status = 'active'
        )
    );

-- Allow service role to bypass RLS for system operations
CREATE POLICY "Service role can manage audit logs" ON audit_logs
    FOR ALL USING (auth.role() = 'service_role');



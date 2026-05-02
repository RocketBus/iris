-- Enable Row Level Security
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Organizations policies
-- Users can only see organizations they are members of
CREATE POLICY "Users can view organizations they belong to" ON organizations
    FOR SELECT USING (
        id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()::text::uuid 
            AND status = 'active'
        )
    );

-- Only organization owners can update organization details
CREATE POLICY "Only owners can update organizations" ON organizations
    FOR UPDATE USING (
        id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()::text::uuid 
            AND role = 'owner' 
            AND status = 'active'
        )
    );

-- Only owners can delete organizations
CREATE POLICY "Only owners can delete organizations" ON organizations
    FOR DELETE USING (
        id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()::text::uuid 
            AND role = 'owner' 
            AND status = 'active'
        )
    );

-- Users policies
-- Users can view their own profile
CREATE POLICY "Users can view their own profile" ON users
    FOR SELECT USING (id = auth.uid()::text::uuid);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile" ON users
    FOR UPDATE USING (id = auth.uid()::text::uuid);

-- Users can view other users in their organizations
CREATE POLICY "Users can view organization members" ON users
    FOR SELECT USING (
        id IN (
            SELECT user_id 
            FROM organization_members 
            WHERE organization_id IN (
                SELECT organization_id 
                FROM organization_members 
                WHERE user_id = auth.uid()::text::uuid 
                AND status = 'active'
            )
        )
    );

-- Organization members policies
-- Users can view members of their organizations
CREATE POLICY "Users can view organization members" ON organization_members
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()::text::uuid 
            AND status = 'active'
        )
    );

-- Only admins and owners can invite users
CREATE POLICY "Admins and owners can invite users" ON organization_members
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()::text::uuid 
            AND role IN ('admin', 'owner') 
            AND status = 'active'
        )
    );

-- Only admins and owners can update member roles
CREATE POLICY "Admins and owners can update member roles" ON organization_members
    FOR UPDATE USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()::text::uuid 
            AND role IN ('admin', 'owner') 
            AND status = 'active'
        )
    );

-- Only owners can remove members
CREATE POLICY "Only owners can remove members" ON organization_members
    FOR DELETE USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()::text::uuid 
            AND role = 'owner' 
            AND status = 'active'
        )
    );

-- Invitations policies
-- Users can view invitations for their organizations
CREATE POLICY "Users can view organization invitations" ON invitations
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()::text::uuid 
            AND role IN ('admin', 'owner') 
            AND status = 'active'
        )
    );

-- Anyone can view invitations by token (for accepting invitations)
CREATE POLICY "Anyone can view invitations by token" ON invitations
    FOR SELECT USING (true);

-- Only admins and owners can create invitations
CREATE POLICY "Admins and owners can create invitations" ON invitations
    FOR INSERT WITH CHECK (
        organization_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()::text::uuid 
            AND role IN ('admin', 'owner') 
            AND status = 'active'
        )
    );

-- Only admins and owners can delete invitations
CREATE POLICY "Admins and owners can delete invitations" ON invitations
    FOR DELETE USING (
        organization_id IN (
            SELECT organization_id 
            FROM organization_members 
            WHERE user_id = auth.uid()::text::uuid 
            AND role IN ('admin', 'owner') 
            AND status = 'active'
        )
    );

-- Allow service role to bypass RLS for system operations
CREATE POLICY "Service role bypass" ON organizations
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role bypass" ON users
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role bypass" ON organization_members
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role bypass" ON invitations
    FOR ALL USING (auth.role() = 'service_role');

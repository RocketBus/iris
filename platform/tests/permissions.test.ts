import { describe, it, expect } from 'vitest';

import {
  hasPermission,
  getRolePermissions,
  canUserPerformAction,
  getAccessibleRoutes,
  canInviteMembers,
  canManageMembers,
  canChangeRoles,
  canRemoveMembers,
  canCancelInvitations,
  canResendInvitations,
} from '@/lib/permissions';

describe('hasPermission', () => {
  // Owner permissions
  it('owner can read organization', () => {
    expect(hasPermission('owner', 'organization', 'read')).toBe(true);
  });

  it('owner can delete organization', () => {
    expect(hasPermission('owner', 'organization', 'delete')).toBe(true);
  });

  it('owner can manage billing', () => {
    expect(hasPermission('owner', 'organization', 'billing')).toBe(true);
  });

  it('owner can invite users', () => {
    expect(hasPermission('owner', 'users', 'invite')).toBe(true);
  });

  it('owner can delete users', () => {
    expect(hasPermission('owner', 'users', 'delete')).toBe(true);
  });

  // Admin permissions
  it('admin can read organization', () => {
    expect(hasPermission('admin', 'organization', 'read')).toBe(true);
  });

  it('admin can update organization', () => {
    expect(hasPermission('admin', 'organization', 'update')).toBe(true);
  });

  it('admin cannot delete organization', () => {
    expect(hasPermission('admin', 'organization', 'delete')).toBe(false);
  });

  it('admin cannot manage billing', () => {
    expect(hasPermission('admin', 'organization', 'billing')).toBe(false);
  });

  it('admin can invite users', () => {
    expect(hasPermission('admin', 'users', 'invite')).toBe(true);
  });

  it('admin cannot delete users', () => {
    expect(hasPermission('admin', 'users', 'delete')).toBe(false);
  });

  // Member permissions
  it('member can read organization', () => {
    expect(hasPermission('member', 'organization', 'read')).toBe(true);
  });

  it('member cannot update organization', () => {
    expect(hasPermission('member', 'organization', 'update')).toBe(false);
  });

  it('member cannot invite users', () => {
    expect(hasPermission('member', 'users', 'invite')).toBe(false);
  });

  it('member can read features', () => {
    expect(hasPermission('member', 'features', 'read')).toBe(true);
  });

  // Invalid role
  it('returns false for invalid role', () => {
    expect(hasPermission('invalid' as any, 'organization', 'read')).toBe(false);
  });

  // Invalid resource/action
  it('returns false for non-existent resource', () => {
    expect(hasPermission('owner', 'nonexistent', 'read')).toBe(false);
  });
});

describe('getRolePermissions', () => {
  it('returns permissions for owner', () => {
    const perms = getRolePermissions('owner');
    expect(perms.length).toBeGreaterThan(0);
    expect(perms).toContainEqual({ resource: 'organization', action: 'delete' });
  });

  it('returns permissions for admin', () => {
    const perms = getRolePermissions('admin');
    expect(perms.length).toBeGreaterThan(0);
    expect(perms).not.toContainEqual({ resource: 'organization', action: 'delete' });
  });

  it('returns permissions for member', () => {
    const perms = getRolePermissions('member');
    expect(perms.length).toBeGreaterThan(0);
    expect(perms).toContainEqual({ resource: 'organization', action: 'read' });
  });

  it('returns empty for invalid role', () => {
    expect(getRolePermissions('invalid' as any)).toEqual([]);
  });
});

describe('canUserPerformAction', () => {
  it('delegates to hasPermission', () => {
    expect(canUserPerformAction('owner', 'organization', 'delete')).toBe(true);
    expect(canUserPerformAction('member', 'organization', 'delete')).toBe(false);
  });
});

describe('getAccessibleRoutes', () => {
  it('owner has all routes', () => {
    const routes = getAccessibleRoutes('owner');
    expect(routes).toContain('/dashboard');
    expect(routes).toContain('/profile');
    expect(routes).toContain('/team');
    expect(routes).toContain('/settings');
    expect(routes).toContain('/invite');
  });

  it('admin has most routes', () => {
    const routes = getAccessibleRoutes('admin');
    expect(routes).toContain('/dashboard');
    expect(routes).toContain('/team');
    expect(routes).toContain('/settings');
  });

  it('member has limited routes', () => {
    const routes = getAccessibleRoutes('member');
    expect(routes).toContain('/dashboard');
    expect(routes).toContain('/profile');
    expect(routes).toContain('/team');
    expect(routes).not.toContain('/settings');
  });
});

describe('team management helpers', () => {
  it('canInviteMembers', () => {
    expect(canInviteMembers('owner')).toBe(true);
    expect(canInviteMembers('admin')).toBe(true);
    expect(canInviteMembers('member')).toBe(false);
  });

  it('canManageMembers', () => {
    expect(canManageMembers('owner')).toBe(true);
    expect(canManageMembers('admin')).toBe(true);
    expect(canManageMembers('member')).toBe(false);
  });

  it('canChangeRoles', () => {
    expect(canChangeRoles('owner')).toBe(true);
    expect(canChangeRoles('admin')).toBe(false);
    expect(canChangeRoles('member')).toBe(false);
  });

  it('canRemoveMembers', () => {
    // Owner can remove anyone
    expect(canRemoveMembers('owner', 'admin')).toBe(true);
    expect(canRemoveMembers('owner', 'member')).toBe(true);

    // Admin can only remove members
    expect(canRemoveMembers('admin', 'member')).toBe(true);
    expect(canRemoveMembers('admin', 'admin')).toBe(false);
    expect(canRemoveMembers('admin', 'owner')).toBe(false);

    // Member can't remove anyone
    expect(canRemoveMembers('member', 'member')).toBe(false);
  });

  it('canCancelInvitations', () => {
    expect(canCancelInvitations('owner')).toBe(true);
    expect(canCancelInvitations('admin')).toBe(true);
    expect(canCancelInvitations('member')).toBe(false);
  });

  it('canResendInvitations', () => {
    expect(canResendInvitations('owner')).toBe(true);
    expect(canResendInvitations('admin')).toBe(true);
    expect(canResendInvitations('member')).toBe(false);
  });
});

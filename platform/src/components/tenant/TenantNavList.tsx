'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  LayoutDashboard,
  GitBranch,
  ArrowLeftRight,
  Eye,
  Users,
  User,
  ScrollText,
  Settings,
} from 'lucide-react';

import { useTenant } from './TenantProvider';

import { useTranslation } from '@/hooks/useTranslation';
import type { FeatureKey } from '@/lib/features';
import { useFeatureFlags } from '@/lib/features/client';
import { cn } from '@/lib/utils';

export interface TenantNavItem {
  translationKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: string[];
  featureKey?: FeatureKey;
}

export const tenantNavItems: TenantNavItem[] = [
  {
    translationKey: 'navigation.dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    roles: ['owner', 'admin', 'member'],
  },
  {
    translationKey: 'navigation.repositories',
    href: '/repos',
    icon: GitBranch,
    roles: ['owner', 'admin', 'member'],
  },
  {
    translationKey: 'navigation.compare',
    href: '/compare',
    icon: ArrowLeftRight,
    roles: ['owner', 'admin', 'member'],
  },
  {
    translationKey: 'navigation.aiExposure',
    href: '/ai-exposure',
    icon: Eye,
    roles: ['owner', 'admin', 'member'],
  },
  {
    translationKey: 'navigation.team',
    href: '/team',
    icon: Users,
    roles: ['owner', 'admin'],
  },
  {
    translationKey: 'navigation.settings',
    href: '/settings',
    icon: Settings,
    roles: ['owner', 'admin'],
  },
  {
    translationKey: 'navigation.auditLog',
    href: '/audit-log',
    icon: ScrollText,
    roles: ['owner', 'admin'],
    featureKey: 'auditLog',
  },
  {
    translationKey: 'navigation.profile',
    href: '/profile',
    icon: User,
    roles: ['owner', 'admin', 'member'],
  },
];

interface TenantNavListProps {
  onItemClick?: () => void;
  className?: string;
}

export function TenantNavList({ onItemClick, className }: TenantNavListProps) {
  const { tenant, role } = useTenant();
  const pathname = usePathname();
  const { t } = useTranslation();
  const featureFlags = useFeatureFlags();

  const filteredNavItems = tenantNavItems.filter((item) => {
    if (!item.roles.includes(role)) {
      return false;
    }
    if (!item.featureKey) {
      return true;
    }
    return featureFlags[item.featureKey]?.enabled ?? false;
  });

  return (
    <nav className={cn('space-y-1', className)}>
      {filteredNavItems.map((item) => {
        const isActive = pathname === `/${tenant}${item.href}`;
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={`/${tenant}${item.href}`}
            onClick={onItemClick}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
              'hover:bg-accent hover:text-accent-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              isActive
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground'
            )}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{t(item.translationKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

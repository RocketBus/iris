import { cache } from 'react';

import {
  FeatureFlagMap,
  FeatureKey,
  isFeatureEnabled,
  resolveFeatureFlags,
} from '@/lib/features';

export const getServerFeatureFlags = cache((): FeatureFlagMap => {
  return resolveFeatureFlags();
});

export function isServerFeatureEnabled(feature: FeatureKey): boolean {
  const flags = getServerFeatureFlags();
  return isFeatureEnabled(feature, flags);
}


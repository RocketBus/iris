import {
  featuresConfig,
  type FeatureConfig,
} from '../../config/features.config';

const PRIVATE_PREFIX = 'FEATURES__';
const PUBLIC_PREFIX = 'NEXT_PUBLIC_FEATURES__';

export type FeatureKey = keyof typeof featuresConfig | string;

export type FeatureFlag = FeatureConfig & {
  key: FeatureKey;
  source: 'config' | 'env';
};

export type FeatureFlagMap = Record<FeatureKey, FeatureFlag>;

function camelCaseFromSegments(segments: string[]): string {
  return segments
    .map((segment, index) => {
      if (index === 0) {
        return segment.toLowerCase();
      }
      return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase();
    })
    .join('');
}

function normalizeEnvKey(rawKey: string, prefix: string): FeatureKey | null {
  if (!rawKey.startsWith(prefix)) {
    return null;
  }

  const withoutPrefix = rawKey.slice(prefix.length);
  if (!withoutPrefix) {
    return null;
  }

  const segments = withoutPrefix.split('_').filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  return camelCaseFromSegments(segments);
}

function readEnvOverrides(): Partial<Record<FeatureKey, boolean>> {
  const overrides: Partial<Record<FeatureKey, boolean>> = {};

  const entries = Object.entries(process.env);
  for (const [key, value] of entries) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      continue;
    }

    const normalizedKey =
      normalizeEnvKey(key, PRIVATE_PREFIX) ??
      normalizeEnvKey(key, PUBLIC_PREFIX);

    if (!normalizedKey) {
      continue;
    }

    const normalizedValue = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalizedValue)) {
      overrides[normalizedKey] = true;
    } else if (['0', 'false', 'no', 'off', 'disabled'].includes(normalizedValue)) {
      overrides[normalizedKey] = false;
    }
  }

  return overrides;
}

export function resolveFeatureFlags(): FeatureFlagMap {
  const overrides = readEnvOverrides();
  const resolved: FeatureFlagMap = {};

  Object.entries(featuresConfig).forEach(([key, config]) => {
    const featureKey = key as FeatureKey;
    const override = overrides[featureKey];
    resolved[featureKey] = {
      ...config,
      key: featureKey,
      enabled: override ?? config.enabled,
      source: override === undefined ? 'config' : 'env',
    };
  });

  return resolved;
}

export function isFeatureEnabled(feature: FeatureKey, flags?: FeatureFlagMap): boolean {
  const mergedFlags = flags ?? resolveFeatureFlags();
  return mergedFlags[feature]?.enabled ?? false;
}


'use client';

import { useMemo } from 'react';

import { useLanguageContext } from '@/components/providers/LanguageProvider';
import { translations } from '@/lib/translations';

/**
 * Client-side translation hook for public pages.
 * Reads the active language from LanguageProvider, which resolves it via the
 * server (cookie → Accept-Language → pt-BR fallback) and keeps it in sync with
 * cookie / navigator changes after hydration.
 */
export function useBrowserTranslation() {
  const browserLanguage = useLanguageContext();

  const t = useMemo(() => {
    return (path: string, params?: Record<string, string | number>): string => {
      const keys = path.split('.');

      function lookup(source: unknown): string | undefined {
        let value = source;
        for (const key of keys) {
          if (value && typeof value === 'object' && key in (value as Record<string, unknown>)) {
            value = (value as Record<string, unknown>)[key];
          } else {
            return undefined;
          }
        }
        return typeof value === 'string' ? value : undefined;
      }

      const value =
        lookup(translations[browserLanguage]) ?? lookup(translations['en-US']);
      if (value === undefined) return path;

      if (params) {
        let result = value;
        for (const [key, val] of Object.entries(params)) {
          result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val));
        }
        return result;
      }

      return value;
    };
  }, [browserLanguage]);

  return { t, language: browserLanguage };
}

'use client';

import { useMemo } from 'react';

import { useSession } from 'next-auth/react';

import { DEFAULT_LANGUAGE } from '@/lib/locale';
import { translations, type Language } from '@/lib/translations';

interface UserPreferences {
  language?: Language;
}

interface SessionUser {
  preferences?: UserPreferences;
}

export function useTranslation() {
  const { data: session } = useSession();
  
  // Get user's language preference from session, defaulting to pt-BR.
  // Note: localStorage is NOT checked during render to avoid hydration mismatch
  // (server resolves via cookie/Accept-Language, falling back to pt-BR).
  const language: Language = useMemo(() => {
    if (session?.user && 'preferences' in session.user) {
      const prefs = (session.user as SessionUser).preferences;
      if (prefs?.language === 'pt-BR' || prefs?.language === 'en-US') {
        return prefs.language;
      }
    }
    return DEFAULT_LANGUAGE;
  }, [session]);

  const t = useMemo(() => {
    return (path: string, params?: Record<string, string | number>): string => {
      const keys = path.split('.');

      function lookup(source: unknown): string | undefined {
        let value: any = source;
        for (const key of keys) {
          if (value && typeof value === 'object' && key in value) {
            value = value[key];
          } else {
            return undefined;
          }
        }
        return typeof value === 'string' ? value : undefined;
      }

      const value =
        lookup(translations[language]) ?? lookup(translations['en-US']);
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
  }, [language]);

  return { t, language };
}


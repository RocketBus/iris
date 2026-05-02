import { cookies, headers } from 'next/headers';

import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/lib/auth';
import {
  LANGUAGE_COOKIE,
  isLanguage,
  pickLanguage,
} from '@/lib/locale';
import { translations, type Language } from '@/lib/translations';

interface UserPreferences {
  language?: Language;
}

interface SessionUser {
  preferences?: UserPreferences;
}

async function resolveLanguage(): Promise<Language> {
  const session = await getServerSession(authOptions);

  if (session?.user && 'preferences' in session.user) {
    const prefs = (session.user as SessionUser).preferences;
    if (isLanguage(prefs?.language)) return prefs.language;
  }

  const cookieStore = await cookies();
  const headerStore = await headers();
  return pickLanguage({
    cookie: cookieStore.get(LANGUAGE_COOKIE)?.value,
    acceptLanguage: headerStore.get('accept-language'),
  });
}

function makeTranslator(language: Language) {
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

    const value = lookup(translations[language]) ?? lookup(translations['en-US']);
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
}

/**
 * Server-side translation for any context. Resolution order:
 *   1. Authenticated user's preference (session)
 *   2. `iris_lang` cookie
 *   3. Accept-Language header
 *   4. pt-BR fallback
 */
export async function getServerTranslation() {
  const language = await resolveLanguage();
  return { t: makeTranslator(language), language };
}

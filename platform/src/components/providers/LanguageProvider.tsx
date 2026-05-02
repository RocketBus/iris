'use client';

import { createContext, useContext, useEffect, useState } from 'react';

import {
  DEFAULT_LANGUAGE,
  LANGUAGE_CHANGE_EVENT,
  LANGUAGE_COOKIE,
  isLanguage,
  parseAcceptLanguage,
} from '@/lib/locale';
import type { Language } from '@/lib/translations';

const LanguageContext = createContext<Language>(DEFAULT_LANGUAGE);

function readClientCookie(): Language | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${LANGUAGE_COOKIE}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.split('=')[1] ?? '');
  return isLanguage(value) ? value : null;
}

export function LanguageProvider({
  initialLanguage,
  children,
}: {
  initialLanguage: Language;
  children: React.ReactNode;
}) {
  const [language, setLanguage] = useState<Language>(initialLanguage);

  useEffect(() => {
    // Sync with cookie or navigator.language after mount in case the
    // server-resolved value diverges from what the client persists.
    const fromCookie = readClientCookie();
    if (fromCookie && fromCookie !== language) {
      setLanguage(fromCookie);
      return;
    }
    if (typeof navigator !== 'undefined') {
      const nav = navigator as Navigator & { userLanguage?: string };
      const fromNav = parseAcceptLanguage(nav.language || nav.userLanguage);
      if (fromNav && fromNav !== language && !fromCookie) {
        setLanguage(fromNav);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onChange() {
      const next = readClientCookie();
      if (next) setLanguage(next);
    }
    window.addEventListener(LANGUAGE_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(LANGUAGE_CHANGE_EVENT, onChange);
  }, []);

  return (
    <LanguageContext.Provider value={language}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguageContext(): Language {
  return useContext(LanguageContext);
}

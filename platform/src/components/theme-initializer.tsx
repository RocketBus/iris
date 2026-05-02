'use client';

import { useEffect, useRef } from 'react';

import { useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';

/**
 * Component that initializes theme from user preferences in database
 * This ensures theme preference persists across sessions and browsers
 */
export function ThemeInitializer() {
  const { data: session, status } = useSession();
  const { setTheme } = useTheme();
  const isInitialized = useRef(false);

  useEffect(() => {
    if (status === 'loading' || isInitialized.current) return;
    isInitialized.current = true;

    if (session?.user) {
      const userPrefs = session.user as any;
      const savedTheme = userPrefs?.themePreference || userPrefs?.preferences?.theme;
      if (savedTheme) {
        setTheme(savedTheme);
      }
    }
  }, [session, status, setTheme]);

  return null;
}


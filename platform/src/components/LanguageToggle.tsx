'use client';

import { useCallback } from 'react';

import { useBrowserTranslation } from '@/hooks/useBrowserTranslation';
import {
  LANGUAGE_CHANGE_EVENT,
  LANGUAGE_COOKIE,
  LANGUAGE_COOKIE_MAX_AGE,
} from '@/lib/locale';
import type { Language } from '@/lib/translations';
import { cn } from '@/lib/utils';

const ORDER: Language[] = ['en-US', 'pt-BR', 'es-ES'];
const LABELS: Record<Language, string> = {
  'en-US': 'EN',
  'pt-BR': 'PT',
  'es-ES': 'ES',
};

function setLanguageCookie(lang: Language) {
  if (typeof document === 'undefined') return;
  const isSecure = window.location.protocol === 'https:';
  const parts = [
    `${LANGUAGE_COOKIE}=${encodeURIComponent(lang)}`,
    'path=/',
    `max-age=${LANGUAGE_COOKIE_MAX_AGE}`,
    'samesite=lax',
  ];
  if (isSecure) parts.push('secure');
  document.cookie = parts.join('; ');
}

export function LanguageToggle({ className }: { className?: string }) {
  const { language } = useBrowserTranslation();

  const change = useCallback((next: Language) => {
    if (next === language) return;
    setLanguageCookie(next);
    window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT));
  }, [language]);

  return (
    <div
      role="group"
      aria-label="Language / Idioma"
      className={cn(
        'inline-flex overflow-hidden rounded-full border border-border/60 text-xs font-medium',
        className,
      )}
    >
      {ORDER.map((lang) => {
        const active = language === lang;
        return (
          <button
            key={lang}
            type="button"
            onClick={() => change(lang)}
            aria-pressed={active}
            className={cn(
              'px-2.5 py-1 transition-colors',
              active
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {LABELS[lang]}
          </button>
        );
      })}
    </div>
  );
}

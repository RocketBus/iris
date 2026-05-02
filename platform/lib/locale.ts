import type { Language } from '@/lib/translations';

export const LANGUAGE_COOKIE = 'iris_lang';
export const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
export const LANGUAGE_CHANGE_EVENT = 'iris:language-change';

export function isLanguage(value: unknown): value is Language {
  return value === 'en-US' || value === 'pt-BR' || value === 'es-ES';
}

export function parseAcceptLanguage(header: string | null | undefined): Language | null {
  if (!header) return null;
  const tags = header
    .split(',')
    .map((entry) => {
      const [tag, qPart] = entry.trim().split(';');
      const q = qPart && qPart.startsWith('q=') ? Number(qPart.slice(2)) : 1;
      return { tag: tag.toLowerCase(), q: Number.isFinite(q) ? q : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    if (tag.startsWith('pt')) return 'pt-BR';
    if (tag.startsWith('es')) return 'es-ES';
    if (tag.startsWith('en')) return 'en-US';
  }
  return null;
}

export const DEFAULT_LANGUAGE: Language = 'pt-BR';

export function pickLanguage(input: {
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Language {
  if (isLanguage(input.cookie)) return input.cookie;
  return parseAcceptLanguage(input.acceptLanguage) ?? DEFAULT_LANGUAGE;
}

const RAW_PERSONAL_EMAIL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'hotmail.com.br',
  'hotmail.co.uk',
  'live.com',
  'live.com.br',
  'outlook.com',
  'outlook.com.br',
  'outlook.com.au',
  'msn.com',
  'yahoo.com',
  'yahoo.com.br',
  'yahoo.co.uk',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'pm.me',
  'zoho.com',
  'mail.com',
  'gmx.com',
  'gmx.de',
  'yandex.com',
  'yandex.ru',
  'yandex.ua',
  'yandex.kz',
  'yopmail.com',
  'bol.com.br',
  'uol.com.br',
  'terra.com.br',
];

export const PERSONAL_EMAIL_DOMAINS = new Set(
  RAW_PERSONAL_EMAIL_DOMAINS.map((domain) => domain.toLowerCase())
);

export function normalizeEmailDomain(domain: string | null | undefined): string | null {
  if (!domain) {
    return null;
  }

  const normalized = domain.trim().toLowerCase();
  return normalized || null;
}

export function getEmailDomain(email: string | null | undefined): string | null {
  if (!email) {
    return null;
  }

  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1 || atIndex === email.length - 1) {
    return null;
  }

  return normalizeEmailDomain(email.slice(atIndex + 1));
}

export function isPersonalEmailDomain(domain: string | null | undefined): boolean {
  const normalizedDomain = normalizeEmailDomain(domain);
  if (!normalizedDomain) {
    return false;
  }

  return PERSONAL_EMAIL_DOMAINS.has(normalizedDomain);
}



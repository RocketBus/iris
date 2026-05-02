import { describe, it, expect } from 'vitest';

import {
  PERSONAL_EMAIL_DOMAINS,
  normalizeEmailDomain,
  getEmailDomain,
  isPersonalEmailDomain,
} from '@/lib/email-domain';

describe('PERSONAL_EMAIL_DOMAINS', () => {
  it('contains common personal email providers', () => {
    expect(PERSONAL_EMAIL_DOMAINS.has('gmail.com')).toBe(true);
    expect(PERSONAL_EMAIL_DOMAINS.has('hotmail.com')).toBe(true);
    expect(PERSONAL_EMAIL_DOMAINS.has('outlook.com')).toBe(true);
    expect(PERSONAL_EMAIL_DOMAINS.has('yahoo.com')).toBe(true);
    expect(PERSONAL_EMAIL_DOMAINS.has('icloud.com')).toBe(true);
    expect(PERSONAL_EMAIL_DOMAINS.has('protonmail.com')).toBe(true);
    expect(PERSONAL_EMAIL_DOMAINS.has('proton.me')).toBe(true);
  });

  it('contains Brazilian providers', () => {
    expect(PERSONAL_EMAIL_DOMAINS.has('hotmail.com.br')).toBe(true);
    expect(PERSONAL_EMAIL_DOMAINS.has('uol.com.br')).toBe(true);
    expect(PERSONAL_EMAIL_DOMAINS.has('bol.com.br')).toBe(true);
    expect(PERSONAL_EMAIL_DOMAINS.has('terra.com.br')).toBe(true);
  });

  it('stores all domains in lowercase', () => {
    for (const domain of PERSONAL_EMAIL_DOMAINS) {
      expect(domain).toBe(domain.toLowerCase());
    }
  });
});

describe('normalizeEmailDomain', () => {
  it('returns null for null/undefined/empty', () => {
    expect(normalizeEmailDomain(null)).toBeNull();
    expect(normalizeEmailDomain(undefined)).toBeNull();
    expect(normalizeEmailDomain('')).toBeNull();
    expect(normalizeEmailDomain('   ')).toBeNull();
  });

  it('lowercases the domain', () => {
    expect(normalizeEmailDomain('GMAIL.COM')).toBe('gmail.com');
    expect(normalizeEmailDomain('Example.Com')).toBe('example.com');
  });

  it('trims whitespace', () => {
    expect(normalizeEmailDomain('  gmail.com  ')).toBe('gmail.com');
  });
});

describe('getEmailDomain', () => {
  it('returns null for null/undefined/empty', () => {
    expect(getEmailDomain(null)).toBeNull();
    expect(getEmailDomain(undefined)).toBeNull();
    expect(getEmailDomain('')).toBeNull();
  });

  it('extracts domain from valid email', () => {
    expect(getEmailDomain('user@example.com')).toBe('example.com');
    expect(getEmailDomain('admin@company.co.uk')).toBe('company.co.uk');
  });

  it('handles email with multiple @ signs (uses last)', () => {
    expect(getEmailDomain('user@weird@example.com')).toBe('example.com');
  });

  it('returns null for email without domain', () => {
    expect(getEmailDomain('user@')).toBeNull();
  });

  it('returns null for string without @', () => {
    expect(getEmailDomain('no-at-sign')).toBeNull();
  });

  it('normalizes the domain', () => {
    expect(getEmailDomain('user@EXAMPLE.COM')).toBe('example.com');
  });
});

describe('isPersonalEmailDomain', () => {
  it('returns true for personal email domains', () => {
    expect(isPersonalEmailDomain('gmail.com')).toBe(true);
    expect(isPersonalEmailDomain('hotmail.com')).toBe(true);
    expect(isPersonalEmailDomain('yahoo.com')).toBe(true);
  });

  it('returns false for corporate domains', () => {
    expect(isPersonalEmailDomain('company.com')).toBe(false);
    expect(isPersonalEmailDomain('startup.io')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isPersonalEmailDomain('GMAIL.COM')).toBe(true);
    expect(isPersonalEmailDomain('Gmail.Com')).toBe(true);
  });

  it('returns false for null/undefined/empty', () => {
    expect(isPersonalEmailDomain(null)).toBe(false);
    expect(isPersonalEmailDomain(undefined)).toBe(false);
    expect(isPersonalEmailDomain('')).toBe(false);
  });
});

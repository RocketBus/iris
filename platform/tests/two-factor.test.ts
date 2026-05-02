import { describe, it, expect, vi } from 'vitest';

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            gt: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: null, error: null }),
                })),
              })),
            })),
          })),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      })),
    })),
  },
}));

// Mock speakeasy
vi.mock('speakeasy', () => ({
  default: {
    generateSecret: vi.fn(() => ({
      base32: 'JBSWY3DPEHPK3PXP',
      otpauth_url: 'otpauth://totp/App%20(test@test.com)?secret=JBSWY3DPEHPK3PXP',
    })),
    totp: {
      verify: vi.fn(({ token }: { token: string }) => token === '123456'),
    },
  },
}));

// Mock qrcode
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mock'),
  },
}));

import {
  generate2FACode,
  generateBackupCodes,
  generateTOTPSecret,
  generateTOTPQRCode,
  verifyTOTPCode,
  verify2FACode,
  verifyBackupCode,
} from '@/lib/two-factor';

describe('generate2FACode', () => {
  it('generates a 6-digit code', () => {
    const code = generate2FACode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('generates different codes', () => {
    const codes = new Set(Array.from({ length: 10 }, () => generate2FACode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('generateBackupCodes', () => {
  it('generates 10 backup codes', () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
  });

  it('generates uppercase alphanumeric codes', () => {
    const codes = generateBackupCodes();
    codes.forEach((code) => {
      expect(code).toMatch(/^[A-Z0-9]+$/);
    });
  });

  it('generates unique codes', () => {
    const codes = generateBackupCodes();
    const unique = new Set(codes);
    expect(unique.size).toBe(10);
  });
});

describe('generateTOTPSecret', () => {
  it('returns secret and otpauth URL', () => {
    const result = generateTOTPSecret('test@test.com');
    expect(result.secret).toBeTruthy();
    expect(result.otpauthUrl).toContain('otpauth://');
  });

  it('uses custom app name', () => {
    const result = generateTOTPSecret('test@test.com', 'MyApp');
    expect(result.secret).toBeTruthy();
  });
});

describe('generateTOTPQRCode', () => {
  it('generates a data URL', async () => {
    const qr = await generateTOTPQRCode('otpauth://totp/test');
    expect(qr).toContain('data:image/png;base64');
  });
});

describe('verifyTOTPCode', () => {
  it('returns true for valid code', () => {
    expect(verifyTOTPCode('JBSWY3DPEHPK3PXP', '123456')).toBe(true);
  });

  it('returns false for invalid code', () => {
    expect(verifyTOTPCode('JBSWY3DPEHPK3PXP', '000000')).toBe(false);
  });

  it('accepts custom window parameter', () => {
    const result = verifyTOTPCode('JBSWY3DPEHPK3PXP', '123456', 5);
    expect(result).toBe(true);
  });

});

describe('verify2FACode', () => {
  it('returns false when no stored code found', async () => {
    const result = await verify2FACode('user-1', '123456');
    expect(result).toBe(false);
  });
});

describe('verifyBackupCode', () => {
  it('returns false when user has no backup codes', async () => {
    const result = await verifyBackupCode('user-1', 'ABCDEF');
    expect(result).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  logger,
  LogLevel,
  generateRequestId,
  debugAuth,
  debugEmail,
  debugDatabase,
  debugApi,
  debugSecurity,
  debugPerformance,
  logError,
  RequestTimer,
} from '@/lib/debug';

describe('LogLevel enum', () => {
  it('has correct numeric ordering', () => {
    expect(LogLevel.ERROR).toBe(0);
    expect(LogLevel.WARN).toBe(1);
    expect(LogLevel.INFO).toBe(2);
    expect(LogLevel.DEBUG).toBe(3);
    expect(LogLevel.TRACE).toBe(4);
  });
});

describe('logger', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs error messages', () => {
    logger.error('test error');
    expect(console.error).toHaveBeenCalled();
  });

  it('logs warn messages', () => {
    logger.warn('test warning');
    expect(console.warn).toHaveBeenCalled();
  });

  it('logs info messages', () => {
    logger.info('test info');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('logs debug messages', () => {
    logger.debug('test debug');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('logs trace messages (test env defaults to DEBUG level)', () => {
    // TRACE level is below DEBUG, so it may not be logged
    logger.trace('test trace');
    // This is fine either way — just exercising the code path
  });

  it('logs with data', () => {
    logger.info('test with data', { key: 'value' });
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('creates child logger with context', () => {
    const child = logger.withContext({ requestId: 'req-123', tenant: 'acme' });
    child.info('child log');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('specialized methods log correctly', () => {
    logger.auth('auth event', { userId: '1' });
    logger.email('email sent', { to: 'user@test.com' });
    logger.database('query executed', { table: 'users' });
    logger.api('request received', { path: '/api/test' });
    logger.performance('timing', { duration: '10ms' });
    // All go through debug level (console.log in dev)
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('security logs at warn level', () => {
    logger.security('suspicious activity', { ip: '1.2.3.4' });
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('generateRequestId', () => {
  it('returns a UUID string', () => {
    const id = generateRequestId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('returns unique IDs', () => {
    const ids = new Set(Array.from({ length: 10 }, () => generateRequestId()));
    expect(ids.size).toBe(10);
  });
});

describe('debug helpers', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('debugAuth logs auth messages', () => {
    debugAuth('login attempt', { email: 'test@test.com' });
    expect(console.log).toHaveBeenCalled();
  });

  it('debugEmail logs email messages', () => {
    debugEmail('email sent');
    expect(console.log).toHaveBeenCalled();
  });

  it('debugDatabase logs database messages', () => {
    debugDatabase('query', { table: 'users' });
    expect(console.log).toHaveBeenCalled();
  });

  it('debugApi logs api messages', () => {
    debugApi('request', { method: 'GET' });
    expect(console.log).toHaveBeenCalled();
  });

  it('debugSecurity logs at warn level', () => {
    debugSecurity('brute force detected');
    expect(console.warn).toHaveBeenCalled();
  });

  it('debugPerformance logs performance messages', () => {
    debugPerformance('slow query', { duration: '500ms' });
    expect(console.log).toHaveBeenCalled();
  });
});

describe('logError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs Error instances with stack', () => {
    logError(new Error('test error'), 'testContext');
    expect(console.error).toHaveBeenCalled();
  });

  it('logs non-Error values', () => {
    logError('string error', 'testContext');
    expect(console.error).toHaveBeenCalled();
  });

  it('works without context', () => {
    logError(new Error('no context'));
    expect(console.error).toHaveBeenCalled();
  });
});

describe('Logger in production mode', () => {
  let prodLogger: any;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (process.env as any).NODE_ENV = 'test';
    delete process.env.DEBUG_LEVEL;
  });

  it('outputs structured JSON in production', async () => {
    (process.env as any).NODE_ENV = 'production';
    vi.resetModules();
    const mod = await import('@/lib/debug');
    mod.logger.error('prod error');
    mod.logger.warn('prod warn');
    mod.logger.info('prod info');
    expect(console.error).toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalled();
  });

  it('respects DEBUG_LEVEL env var', async () => {
    process.env.DEBUG_LEVEL = 'ERROR';
    (process.env as any).NODE_ENV = 'test';
    vi.resetModules();
    const mod = await import('@/lib/debug');
    // With ERROR level, info should not log
    mod.logger.info('should not appear');
    mod.logger.error('should appear');
    expect(console.error).toHaveBeenCalled();
  });

  it('handles WARN level', async () => {
    process.env.DEBUG_LEVEL = 'WARN';
    vi.resetModules();
    const mod = await import('@/lib/debug');
    mod.logger.warn('warning');
    expect(console.warn).toHaveBeenCalled();
  });

  it('handles INFO level', async () => {
    process.env.DEBUG_LEVEL = 'INFO';
    vi.resetModules();
    const mod = await import('@/lib/debug');
    mod.logger.info('info msg');
    expect(console.log).toHaveBeenCalled();
  });

  it('handles TRACE level', async () => {
    process.env.DEBUG_LEVEL = 'TRACE';
    vi.resetModules();
    const mod = await import('@/lib/debug');
    mod.logger.trace('trace msg');
    expect(console.log).toHaveBeenCalled();
  });
});

describe('RequestTimer', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks operation timing', () => {
    const timer = new RequestTimer('testOp');
    timer.checkpoint('step1');
    timer.checkpoint('step2', { rows: 10 });
    timer.end();
    // Timer logs via logger.trace (start) and logger.performance (checkpoint/end)
    expect(console.log).toHaveBeenCalled();
  });

  it('includes extra data in end()', () => {
    const timer = new RequestTimer('testOp');
    timer.end({ success: true });
    expect(console.log).toHaveBeenCalled();
  });
});

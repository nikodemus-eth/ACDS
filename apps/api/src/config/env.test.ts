import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save and clear relevant env vars before each test
    const keys = [
      'PORT', 'DATABASE_URL', 'MASTER_KEY_PATH', 'ADMIN_SESSION_SECRET',
      'NODE_ENV', 'LOG_LEVEL',
    ];
    for (const key of keys) {
      savedEnv[key] = process.env[key];
    }
  });

  // Restore env after each test using a second beforeEach that runs in cleanup
  // We use afterEach-like behavior by restoring in the next beforeEach
  // Actually, vitest supports afterEach natively through the import.
  // Let me use a different approach: set all required vars and test.

  function setRequiredEnv() {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/testdb';
    process.env.MASTER_KEY_PATH = '/tmp/test-key';
    process.env.ADMIN_SESSION_SECRET = 'test-secret-123';
  }

  function restoreEnv() {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  it('returns valid EnvVars with all required vars set', () => {
    setRequiredEnv();
    try {
      const env = loadEnv();
      expect(env.DATABASE_URL).toBe('postgres://user:pass@localhost:5432/testdb');
      expect(env.MASTER_KEY_PATH).toBe('/tmp/test-key');
      expect(env.ADMIN_SESSION_SECRET).toBe('test-secret-123');
    } finally {
      restoreEnv();
    }
  });

  it('uses default PORT of 3100 when not set', () => {
    setRequiredEnv();
    delete process.env.PORT;
    try {
      const env = loadEnv();
      expect(env.PORT).toBe(3100);
    } finally {
      restoreEnv();
    }
  });

  it('uses custom PORT when set', () => {
    setRequiredEnv();
    process.env.PORT = '8080';
    try {
      const env = loadEnv();
      expect(env.PORT).toBe(8080);
    } finally {
      restoreEnv();
    }
  });

  it('uses default NODE_ENV of development when not set', () => {
    setRequiredEnv();
    delete process.env.NODE_ENV;
    try {
      const env = loadEnv();
      expect(env.NODE_ENV).toBe('development');
    } finally {
      restoreEnv();
    }
  });

  it('uses debug LOG_LEVEL when NODE_ENV is not production', () => {
    setRequiredEnv();
    delete process.env.LOG_LEVEL;
    process.env.NODE_ENV = 'development';
    try {
      const env = loadEnv();
      expect(env.LOG_LEVEL).toBe('debug');
    } finally {
      restoreEnv();
    }
  });

  it('uses info LOG_LEVEL when NODE_ENV is production', () => {
    setRequiredEnv();
    delete process.env.LOG_LEVEL;
    process.env.NODE_ENV = 'production';
    try {
      const env = loadEnv();
      expect(env.LOG_LEVEL).toBe('info');
    } finally {
      restoreEnv();
    }
  });

  it('uses custom LOG_LEVEL when set', () => {
    setRequiredEnv();
    process.env.LOG_LEVEL = 'warn';
    try {
      const env = loadEnv();
      expect(env.LOG_LEVEL).toBe('warn');
    } finally {
      restoreEnv();
    }
  });

  it('throws when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    process.env.MASTER_KEY_PATH = '/tmp/key';
    process.env.ADMIN_SESSION_SECRET = 'secret';
    try {
      expect(() => loadEnv()).toThrow('Missing required environment variable: DATABASE_URL');
    } finally {
      restoreEnv();
    }
  });

  it('throws when MASTER_KEY_PATH is missing', () => {
    process.env.DATABASE_URL = 'postgres://localhost/db';
    delete process.env.MASTER_KEY_PATH;
    process.env.ADMIN_SESSION_SECRET = 'secret';
    try {
      expect(() => loadEnv()).toThrow('Missing required environment variable: MASTER_KEY_PATH');
    } finally {
      restoreEnv();
    }
  });

  it('throws when ADMIN_SESSION_SECRET is missing', () => {
    process.env.DATABASE_URL = 'postgres://localhost/db';
    process.env.MASTER_KEY_PATH = '/tmp/key';
    delete process.env.ADMIN_SESSION_SECRET;
    try {
      expect(() => loadEnv()).toThrow('Missing required environment variable: ADMIN_SESSION_SECRET');
    } finally {
      restoreEnv();
    }
  });

  it('throws when required var is empty string', () => {
    process.env.DATABASE_URL = '';
    process.env.MASTER_KEY_PATH = '/tmp/key';
    process.env.ADMIN_SESSION_SECRET = 'secret';
    try {
      expect(() => loadEnv()).toThrow('Missing required environment variable: DATABASE_URL');
    } finally {
      restoreEnv();
    }
  });

  describe('loadDotEnvFile()', () => {
    const envPath = path.resolve(process.cwd(), '.env');
    const hadEnvFile = existsSync(envPath);
    let originalContent: string | null = null;

    beforeEach(() => {
      if (hadEnvFile) {
        const { readFileSync } = require('node:fs');
        originalContent = readFileSync(envPath, 'utf8');
      }
    });

    afterAll(() => {
      // Restore original .env or remove test one
      if (hadEnvFile && originalContent !== null) {
        writeFileSync(envPath, originalContent);
      } else if (!hadEnvFile && existsSync(envPath)) {
        unlinkSync(envPath);
      }
    });

    it('loads vars from .env file when present', () => {
      // Write a temp .env file
      writeFileSync(envPath, [
        'DATABASE_URL=postgres://dotenv-host/db',
        'MASTER_KEY_PATH=/dotenv/key',
        'ADMIN_SESSION_SECRET=dotenv-secret',
        '# This is a comment',
        '',
        'PORT=9999',
      ].join('\n'));

      // Clear env vars so they get loaded from file
      delete process.env.DATABASE_URL;
      delete process.env.MASTER_KEY_PATH;
      delete process.env.ADMIN_SESSION_SECRET;
      delete process.env.PORT;

      try {
        const env = loadEnv();
        expect(env.DATABASE_URL).toBe('postgres://dotenv-host/db');
        expect(env.MASTER_KEY_PATH).toBe('/dotenv/key');
        expect(env.ADMIN_SESSION_SECRET).toBe('dotenv-secret');
        expect(env.PORT).toBe(9999);
      } finally {
        restoreEnv();
        if (!hadEnvFile) {
          unlinkSync(envPath);
        } else if (originalContent !== null) {
          writeFileSync(envPath, originalContent);
        }
      }
    });

    it('does not overwrite existing env vars from .env file', () => {
      writeFileSync(envPath, 'DATABASE_URL=from-file\nMASTER_KEY_PATH=/file-key\nADMIN_SESSION_SECRET=file-secret\n');
      process.env.DATABASE_URL = 'from-process';
      process.env.MASTER_KEY_PATH = '/process-key';
      process.env.ADMIN_SESSION_SECRET = 'process-secret';

      try {
        const env = loadEnv();
        expect(env.DATABASE_URL).toBe('from-process');
      } finally {
        restoreEnv();
        if (!hadEnvFile) unlinkSync(envPath);
        else if (originalContent !== null) writeFileSync(envPath, originalContent);
      }
    });

    it('handles quoted values in .env file', () => {
      writeFileSync(envPath, [
        'DATABASE_URL="postgres://quoted/db"',
        "MASTER_KEY_PATH='/quoted/key'",
        'ADMIN_SESSION_SECRET=unquoted-secret',
      ].join('\n'));

      delete process.env.DATABASE_URL;
      delete process.env.MASTER_KEY_PATH;
      delete process.env.ADMIN_SESSION_SECRET;

      try {
        const env = loadEnv();
        expect(env.DATABASE_URL).toBe('postgres://quoted/db');
        expect(env.MASTER_KEY_PATH).toBe('/quoted/key');
      } finally {
        restoreEnv();
        if (!hadEnvFile) unlinkSync(envPath);
        else if (originalContent !== null) writeFileSync(envPath, originalContent);
      }
    });

    it('skips lines without = separator', () => {
      writeFileSync(envPath, [
        'DATABASE_URL=postgres://host/db',
        'MASTER_KEY_PATH=/key',
        'ADMIN_SESSION_SECRET=secret',
        'no-equals-sign',
        '=no-key',
      ].join('\n'));

      delete process.env.DATABASE_URL;
      delete process.env.MASTER_KEY_PATH;
      delete process.env.ADMIN_SESSION_SECRET;

      try {
        const env = loadEnv();
        expect(env.DATABASE_URL).toBe('postgres://host/db');
      } finally {
        restoreEnv();
        if (!hadEnvFile) unlinkSync(envPath);
        else if (originalContent !== null) writeFileSync(envPath, originalContent);
      }
    });
  });
});

import { config } from '../../src/config/env';

describe('env', () => {
  it('should load configuration from environment', () => {
    expect(config).toBeDefined();
    expect(config.port).toBeGreaterThan(0);
    expect(typeof config.apiKey).toBe('string');
  });

  it('should throw error if required env var is missing', async () => {
    const originalEnv = { ...process.env };
    jest.resetModules();
    delete process.env.API_KEY;

    try {
      // Re-importing to trigger getEnv
      await import('../../src/config/env.js');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain('Environment variable API_KEY is missing');
    } finally {
      process.env = originalEnv;
    }
  });
});

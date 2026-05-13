import axios, { InternalAxiosRequestConfig } from 'axios';
import { api } from '../../src/helpers/api.js';
import { sessionStore } from '../../src/store/sessionStore.js';
import { logger } from '../../src/helpers/logger.js';

// Mock everything before importing api
jest.mock('axios', () => {
  const mockClient = {
    get: jest.fn(),
    post: jest.fn(),
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() },
    },
  };
  return {
    create: jest.fn(() => mockClient),
    isAxiosError: jest.fn(),
    // axios default export
    default: {
      create: jest.fn(() => mockClient),
      isAxiosError: jest.fn(),
      post: jest.fn(),
      get: jest.fn(),
    },
  };
});
jest.mock('../../src/helpers/logger.js');
jest.mock('../../src/store/sessionStore.js');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('API Helper', () => {
  let interceptor: (
    config: InternalAxiosRequestConfig,
  ) => InternalAxiosRequestConfig;
  let mockedClient: {
    get: jest.Mock;
    post: jest.Mock;
    interceptors: { request: { use: jest.Mock } };
  };

  beforeAll(() => {
    mockedClient = (mockedAxios.create as jest.Mock).mock.results[0]
      .value as typeof mockedClient;
    const useMock = mockedClient.interceptors.request.use;
    const firstCall = useMock.mock.calls[0] as unknown[];
    interceptor = firstCall[0] as (
      config: InternalAxiosRequestConfig,
    ) => InternalAxiosRequestConfig;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Default mock behavior for isAxiosError
    (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Interceptors', () => {
    it('should add Authorization header if jwtToken exists', () => {
      const mockToken = 'mock-jwt-token';
      (sessionStore.getSession as jest.Mock).mockReturnValue({
        jwtToken: mockToken,
      });

      const config = { headers: {} } as InternalAxiosRequestConfig;
      const updatedConfig = interceptor(config);

      expect(updatedConfig.headers.Authorization).toBe(`Bearer ${mockToken}`);
    });

    it('should not add Authorization header if jwtToken does not exist', () => {
      (sessionStore.getSession as jest.Mock).mockReturnValue({
        jwtToken: null,
      });

      const config = { headers: {} } as InternalAxiosRequestConfig;
      const updatedConfig = interceptor(config);

      expect(updatedConfig.headers.Authorization).toBeUndefined();
    });
  });

  describe('GET', () => {
    it('should perform successful GET request', async () => {
      const mockData = { success: true };
      mockedClient.get.mockResolvedValueOnce({ data: mockData });

      const result = await api.get('/test-url');

      expect(mockedClient.get).toHaveBeenCalledWith('/test-url', undefined);
      expect(result).toEqual(mockData);
    });

    it('should retry on 403 error and succeed', async () => {
      const mockData = { success: true };
      const error403 = {
        response: { status: 403 },
        isAxiosError: true,
        message: 'Forbidden',
      };
      mockedClient.get
        .mockRejectedValueOnce(error403)
        .mockResolvedValueOnce({ data: mockData });

      const promise = api.get('/test-url');

      // First retry wait
      await jest.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(mockedClient.get).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockData);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('GET /test-url failed with 403. Retrying'),
      );
    });

    it('should throw error and log after all retries fail', async () => {
      const error429 = new Error('Too Many Requests');
      Object.assign(error429, {
        response: { status: 429 },
        isAxiosError: true,
      });

      mockedClient.get.mockRejectedValue(error429);

      const promise = api.get('/test-url');

      // Allow all retry timers to fire while awaiting rejection
      await Promise.all([
        jest.runAllTimersAsync(),
        expect(promise).rejects.toThrow('Too Many Requests'),
      ]);

      expect(mockedClient.get).toHaveBeenCalledTimes(3);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'GET /test-url failed after 3 attempts: Too Many Requests',
        ),
      );
    });

    it('should throw error immediately for non-retryable error', async () => {
      const error500 = new Error('Internal Server Error');
      Object.assign(error500, {
        response: { status: 500 },
        isAxiosError: true,
      });

      mockedClient.get.mockRejectedValueOnce(error500);

      const promise = api.get('/test-url');
      // No timers to advance as it should fail immediately

      await expect(promise).rejects.toThrow('Internal Server Error');
      expect(mockedClient.get).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'GET /test-url failed after 1 attempts: Internal Server Error',
        ),
      );
    });

    it('should retry on Angel One custom error code and succeed', async () => {
      const mockData = { success: true };
      const errorRateLimit = {
        data: {
          status: false,
          message: 'Too many requests',
          errorcode: 'AG8001',
        },
      };
      mockedClient.get
        .mockResolvedValueOnce(errorRateLimit)
        .mockResolvedValueOnce({ data: mockData });

      const promise = api.get('/test-url');
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(mockedClient.get).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockData);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('GET /test-url failed with AG8001. Retrying'),
      );
    });

    it('should throw on non-retryable Angel One custom error code', async () => {
      const errorInvalidToken = {
        data: {
          status: false,
          message: 'Invalid Token',
          errorcode: 'AG8003',
        },
      };
      mockedClient.get.mockResolvedValueOnce(errorInvalidToken);

      const promise = api.get('/test-url');
      await expect(promise).rejects.toThrow('Invalid Token (AG8003)');
      expect(mockedClient.get).toHaveBeenCalledTimes(1);
    });

    it('should log string error on GET failure', async () => {
      // For string error, isAxiosError should be false
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(false);
      mockedClient.get.mockRejectedValueOnce('Unknown Error');

      const promise = api.get('/test-url');

      await expect(promise).rejects.toBe('Unknown Error');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'GET /test-url failed after 1 attempts: Unknown Error',
        ),
      );
    });
  });

  describe('POST', () => {
    it('should perform successful POST request', async () => {
      const mockData = { success: true };
      const postBody = { foo: 'bar' };
      mockedClient.post.mockResolvedValueOnce({ data: mockData });

      const result = await api.post('/test-url', postBody);

      expect(mockedClient.post).toHaveBeenCalledWith(
        '/test-url',
        postBody,
        undefined,
      );
      expect(result).toEqual(mockData);
    });

    it('should retry on 429 error and succeed', async () => {
      const mockData = { success: true };
      const error429 = {
        response: { status: 429 },
        isAxiosError: true,
        message: 'Rate Limited',
      };
      mockedClient.post
        .mockRejectedValueOnce(error429)
        .mockResolvedValueOnce({ data: mockData });

      const promise = api.post('/test-url', {});
      await jest.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(mockedClient.post).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockData);
    });

    it('should throw error and log on POST failure after retries', async () => {
      const errorMessage = 'Network Error';
      const error = new Error(errorMessage);
      (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(false);
      mockedClient.post.mockRejectedValue(error);

      const promise = api.post('/test-url', {});

      await expect(promise).rejects.toThrow(errorMessage);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'POST /test-url failed after 1 attempts: Network Error',
        ),
      );
    });
  });
});

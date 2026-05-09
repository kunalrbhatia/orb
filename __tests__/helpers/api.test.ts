/* eslint-disable @typescript-eslint/unbound-method */
import axios, { InternalAxiosRequestConfig } from 'axios';
import { api } from '../../src/helpers/api.js';
import { sessionStore } from '../../src/store/sessionStore.js';
import { logger } from '../../src/helpers/logger.js';

jest.mock('axios');
jest.mock('../../src/helpers/logger.js');
jest.mock('../../src/store/sessionStore.js');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('API Helper', () => {
  let interceptor: (
    config: InternalAxiosRequestConfig,
  ) => InternalAxiosRequestConfig;

  beforeAll(() => {
    const useMock = mockedAxios.interceptors.request.use as jest.Mock;
    const firstCall = useMock.mock.calls[0] as unknown[];
    interceptor = firstCall[0] as (
      config: InternalAxiosRequestConfig,
    ) => InternalAxiosRequestConfig;
  });

  beforeEach(() => {
    jest.clearAllMocks();
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
      mockedAxios.get.mockResolvedValueOnce({ data: mockData });

      const result = await api.get('/test-url');

      expect(mockedAxios.get).toHaveBeenCalledWith('/test-url', undefined);
      expect(result).toEqual(mockData);
    });

    it('should throw error and log on GET failure', async () => {
      const errorMessage = 'Network Error';
      mockedAxios.get.mockRejectedValueOnce(new Error(errorMessage));

      await expect(api.get('/test-url')).rejects.toThrow(errorMessage);
      expect(logger.error).toHaveBeenCalledWith(
        `GET /test-url failed: ${errorMessage}`,
      );
    });

    it('should log string error on GET failure', async () => {
      mockedAxios.get.mockRejectedValueOnce('Unknown Error');

      await expect(api.get('/test-url')).rejects.toBe('Unknown Error');
      expect(logger.error).toHaveBeenCalledWith(
        `GET /test-url failed: Unknown Error`,
      );
    });
  });

  describe('POST', () => {
    it('should perform successful POST request', async () => {
      const mockData = { success: true };
      const postBody = { foo: 'bar' };
      mockedAxios.post.mockResolvedValueOnce({ data: mockData });

      const result = await api.post('/test-url', postBody);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/test-url',
        postBody,
        undefined,
      );
      expect(result).toEqual(mockData);
    });

    it('should throw error and log on POST failure', async () => {
      const errorMessage = 'Network Error';
      mockedAxios.post.mockRejectedValueOnce(new Error(errorMessage));

      await expect(api.post('/test-url', {})).rejects.toThrow(errorMessage);
      expect(logger.error).toHaveBeenCalledWith(
        `POST /test-url failed: ${errorMessage}`,
      );
    });

    it('should log string error on POST failure', async () => {
      mockedAxios.post.mockRejectedValueOnce('Unknown Error');

      await expect(api.post('/test-url', {})).rejects.toBe('Unknown Error');
      expect(logger.error).toHaveBeenCalledWith(
        `POST /test-url failed: Unknown Error`,
      );
    });
  });
});

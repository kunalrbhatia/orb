import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { ANGEL_ONE_URLS } from './constants.js';
import { config } from '../config/env.js';
import { sessionStore } from '../store/sessionStore.js';
import { logger } from './logger.js';

let publicIp = '127.0.0.1';

async function getPublicIp(): Promise<string> {
  try {
    const response = await axios.get<{ ip: string }>(
      'https://api.ipify.org?format=json',
      { timeout: 5000 },
    );
    publicIp = response.data.ip;
    return publicIp;
  } catch {
    return publicIp;
  }
}

// Initial IP fetch
void getPublicIp();

const apiClient = axios.create({
  baseURL: ANGEL_ONE_URLS.BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-PrivateKey': config.apiKey,
    'X-ClientLocalIP': '127.0.0.1',
    'X-ClientPublicIP': publicIp,
    'X-MACAddress': '00-00-00-00-00-00',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  },
});

apiClient.interceptors.request.use(axiosConfig => {
  const { jwtToken } = sessionStore.getSession();
  if (jwtToken) {
    axiosConfig.headers.Authorization = `Bearer ${jwtToken}`;
  }
  // Refresh public IP in headers if it was updated
  axiosConfig.headers['X-ClientPublicIP'] = publicIp;
  return axiosConfig;
});

export const api = {
  get: async <T>(url: string, axiosConfig?: AxiosRequestConfig): Promise<T> => {
    return withRetry(() => apiClient.get(url, axiosConfig), `GET ${url}`);
  },
  post: async <T>(
    url: string,
    data?: unknown,
    axiosConfig?: AxiosRequestConfig,
  ): Promise<T> => {
    return withRetry(
      () => apiClient.post(url, data, axiosConfig),
      `POST ${url}`,
    );
  },
};

interface AngelOneResponse<T> {
  status: boolean;
  message: string;
  errorcode: string;
  data: T;
}

async function withRetry<T>(
  fn: () => Promise<AxiosResponse<T>>,
  label: string,
  retries = 3,
  delay = 2000,
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fn();

      // Handle Angel One's "200 OK but error in body" pattern
      const data = response.data as unknown as AngelOneResponse<T>;
      if (data && data.status === false && data.errorcode) {
        // Treat certain error codes as retryable if needed,
        // but for now, we'll throw and let the retry logic handle status codes.
        // If it's a 200 OK with status: false, it won't have a statusCode like 403.
        const errorMessage = `${data.message} (${data.errorcode})`;

        // If it's a rate limit or session error in the body, we might want to retry
        const retryableErrorCodes = ['AG8001', 'AG8002', 'AM0001']; // Example codes
        if (retryableErrorCodes.includes(data.errorcode) && attempt < retries) {
          logger.warn(
            `${label} failed with ${data.errorcode}. Retrying... (Attempt ${attempt}/${retries})`,
          );
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }

        throw new Error(errorMessage);
      }

      return response.data;
    } catch (error) {
      const isLastAttempt = attempt === retries;
      const statusCode = axios.isAxiosError(error) ? error.response?.status : 0;
      const message = error instanceof Error ? error.message : String(error);

      // 403 and 429 are definitely retryable for Angel One
      const isRetryable =
        statusCode === 403 ||
        statusCode === 429 ||
        statusCode === 502 ||
        statusCode === 503 ||
        statusCode === 504;

      if (isLastAttempt || !isRetryable) {
        logger.error(`${label} failed after ${attempt} attempts: ${message}`);
        throw error;
      }

      logger.warn(
        `${label} failed with ${statusCode || 'error'}. Retrying in ${delay}ms... (Attempt ${attempt}/${retries})`,
      );
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error('Retry loop ended unexpectedly');
}

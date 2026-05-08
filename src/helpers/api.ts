import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { ANGEL_ONE_URLS } from './constants.js';
import { config } from '../config/env.js';
import { sessionStore } from '../store/sessionStore.js';
import { logger } from './logger.js';

const apiClient = axios.create({
  baseURL: ANGEL_ONE_URLS.BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-PrivateKey': config.apiKey,
  },
});

apiClient.interceptors.request.use(axiosConfig => {
  const { jwtToken } = sessionStore.getSession();
  if (jwtToken) {
    axiosConfig.headers.Authorization = `Bearer ${jwtToken}`;
  }
  return axiosConfig;
});

export const api = {
  get: async <T>(url: string, axiosConfig?: AxiosRequestConfig): Promise<T> => {
    try {
      const response: AxiosResponse<T> = await apiClient.get(url, axiosConfig);
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`GET ${url} failed: ${message}`);
      throw error;
    }
  },
  post: async <T>(
    url: string,
    data?: unknown,
    axiosConfig?: AxiosRequestConfig,
  ): Promise<T> => {
    try {
      const response: AxiosResponse<T> = await apiClient.post(
        url,
        data,
        axiosConfig,
      );
      return response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`POST ${url} failed: ${message}`);
      throw error;
    }
  },
};

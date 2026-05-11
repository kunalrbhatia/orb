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
    'X-SourceID': 'SMARTAPI',
    'X-PrivateKey': config.apiKey,
    'X-ClientLocalIP': '192.168.1.1',
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

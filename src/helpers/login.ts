import { authenticator } from 'otplib';
import { api } from './api.js';
import { ANGEL_ONE_URLS } from './constants.js';
import { config } from '../config/env.js';
import { sessionStore } from '../store/sessionStore.js';
import { logger } from './logger.js';
import axios from 'axios';

let publicIp: string | null = null;

async function getPublicIp(): Promise<string> {
  if (publicIp) return publicIp;
  try {
    const response = await axios.get<{ ip: string }>(
      'https://api.ipify.org?format=json',
    );
    publicIp = response.data.ip;
    return publicIp;
  } catch (error) {
    logger.warn('Failed to get public IP, using fallback');
    return '127.0.0.1';
  }
}

export async function login(): Promise<void> {
  const ip = await getPublicIp();
  const totp = authenticator.generate(config.clientTotpPin);

  const payload = {
    clientcode: config.clientCode,
    password: config.clientPin,
    totp,
  };

  const headers = {
    'X-ClientPublicIP': ip,
    'X-ClientLocalIP': '192.168.1.1',
    'X-MACAddress': '00-00-00-00-00-00',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-PrivateKey': config.apiKey,
  };

  interface LoginResponse {
    status: boolean;
    message: string;
    data: {
      jwtToken: string;
      feedToken: string;
      refreshToken: string;
    };
  }

  try {
    const response = await api.post<LoginResponse>(
      ANGEL_ONE_URLS.LOGIN,
      payload,
      {
        headers,
      },
    );

    if (response.status && response.data) {
      sessionStore.setSession({
        jwtToken: response.data.jwtToken,
        feedToken: response.data.feedToken,
        refreshToken: response.data.refreshToken,
      });
      logger.info('Login successful');
    } else {
      throw new Error(`Login failed: ${response.message}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Login failed: ${message}`);
  }
}

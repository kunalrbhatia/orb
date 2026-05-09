/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { login, _resetPublicIp } from '../../src/helpers/login.js';
import { api } from '../../src/helpers/api.js';
import { sessionStore } from '../../src/store/sessionStore.js';
import { authenticator } from 'otplib';
import axios from 'axios';
import { logger } from '../../src/helpers/logger.js';

jest.mock('axios');
jest.mock('otplib');
jest.mock('../../src/helpers/api.js');
jest.mock('../../src/store/sessionStore.js');
jest.mock('../../src/helpers/logger.js');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetPublicIp();
  });

  it('should login successfully', async () => {
    mockedAxios.get.mockResolvedValue({ data: { ip: '1.2.3.4' } });
    (authenticator.generate as jest.Mock).mockReturnValue('123456');
    (api.post as jest.Mock).mockResolvedValue({
      status: true,
      data: {
        jwtToken: 'jwt',
        feedToken: 'feed',
        refreshToken: 'refresh',
      },
    });

    await login();

    expect(sessionStore.setSession as jest.Mock).toHaveBeenCalledWith({
      jwtToken: 'jwt',
      feedToken: 'feed',
      refreshToken: 'refresh',
    });
    expect(logger.info as jest.Mock).toHaveBeenCalledWith('Login successful');
  });

  it('should use cached IP on second login', async () => {
    mockedAxios.get.mockResolvedValue({ data: { ip: '1.2.3.4' } });
    (api.post as jest.Mock).mockResolvedValue({ status: true, data: {} });

    await login(); // First login, fetches IP
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);

    await login(); // Second login, should use cache
    expect(mockedAxios.get).toHaveBeenCalledTimes(1); // Still 1
  });

  it('should use fallback IP if ipify fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('IP Error'));
    (authenticator.generate as jest.Mock).mockReturnValue('123456');

    const mockPost = api.post as jest.Mock;
    mockPost.mockResolvedValue({
      status: true,
      data: { jwtToken: 'j', feedToken: 'f', refreshToken: 'r' },
    });

    await login();

    expect(logger.warn as jest.Mock).toHaveBeenCalledWith(
      expect.stringContaining('Failed to get public IP'),
    );
    expect(api.post as jest.Mock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-ClientPublicIP': '127.0.0.1' }),
      }),
    );
  });

  it('should throw error if API returns status false', async () => {
    mockedAxios.get.mockResolvedValue({ data: { ip: '1.2.3.4' } });
    (api.post as jest.Mock).mockResolvedValue({
      status: false,
      message: 'Invalid OTP',
    });

    await expect(login()).rejects.toThrow('Login failed: Invalid OTP');
  });

  it('should throw error and handle non-Error objects on API failure', async () => {
    (api.post as jest.Mock).mockRejectedValue('Network Error');
    await expect(login()).rejects.toThrow('Login failed: Network Error');
  });
});

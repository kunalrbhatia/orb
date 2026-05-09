/* eslint-disable @typescript-eslint/unbound-method */
import { sendNotification } from '../src/notifier';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('notifier', () => {
  it('should send telegram notification', async () => {
    mockedAxios.post.mockResolvedValue({ data: {} });
    await sendNotification('test message');
    expect(mockedAxios.post).toHaveBeenCalled();
  });

  it('should handle error gracefully', async () => {
    mockedAxios.post.mockRejectedValue(new Error('API Error'));
    await expect(sendNotification('test message')).resolves.not.toThrow();
  });

  it('should handle non-Error objects in catch block', async () => {
    mockedAxios.post.mockRejectedValue('String Error');
    await expect(sendNotification('test message')).resolves.not.toThrow();
  });
});

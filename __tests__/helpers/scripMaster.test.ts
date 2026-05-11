/* eslint-disable @typescript-eslint/unbound-method */
import { downloadScripMaster } from '../../src/helpers/scripMaster.js';
import axios from 'axios';
import { scripMasterStore } from '../../src/store/scripMasterStore.js';
import { logger } from '../../src/helpers/logger.js';
import fs from 'fs/promises';

jest.mock('axios');
jest.mock('../../src/store/scripMasterStore.js');
jest.mock('../../src/helpers/logger.js');
jest.mock('fs/promises');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('scripMaster', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));
    jest.spyOn(global, 'setTimeout').mockImplementation((cb: any) => {
      if (typeof cb === 'function') cb();
      return {} as any;
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should download and filter scrips successfully', async () => {
    const mockData = [
      {
        exch_seg: 'NFO',
        instrumenttype: 'OPTSTK',
        symbol: 'REL1',
        name: 'RELIANCE',
      },
      {
        exch_seg: 'NSE',
        instrumenttype: 'SYMBOL',
        symbol: 'REL2',
        name: 'RELIANCE',
      }, // Should be filtered out
      {
        exch_seg: 'NFO',
        instrumenttype: 'FUTSTK',
        symbol: 'REL3',
        name: 'RELIANCE',
      }, // Should be filtered out
    ];
    mockedAxios.get.mockResolvedValue({ data: mockData });

    await downloadScripMaster();

    expect(scripMasterStore.setScrips).toHaveBeenCalledWith([mockData[0]]);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Scrip master loaded: 1 instruments found'),
    );
  });

  it(
    'should throw error and log on download failure',
    async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network Error'));

    await expect(downloadScripMaster()).rejects.toThrow('Network Error');
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed to download scrip master after 3 attempts: Network Error',
      ),
    );
  }, 10000);

  it(
    'should handle non-Error objects in catch block',
    async () => {
      mockedAxios.get.mockRejectedValue('String Error');

      await expect(downloadScripMaster()).rejects.toBe('String Error');
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to download scrip master after 3 attempts: String Error',
        ),
      );
    },
    10000,
  );
});

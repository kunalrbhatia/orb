import { scripMasterStore } from '../../src/store/scripMasterStore';

describe('scripMasterStore', () => {
  it('should manage scrips', () => {
    const mockScrip = {
      token: '1',
      symbol: 'SBIN-EQ',
      name: 'SBIN',
      expiry: '2026-05-28',
      strike: '600',
      lotsize: '1500',
      instrumenttype: 'OPTSTK',
      exch_seg: 'NFO',
      tick_size: '0.05',
    };
    scripMasterStore.setScrips([mockScrip]);
    expect(scripMasterStore.getScrips()).toHaveLength(1);
    expect(scripMasterStore.findScripBySymbol('SBIN-EQ')).toEqual(mockScrip);
    expect(scripMasterStore.findScripBySymbol('NON-EXISTENT')).toBeUndefined();
  });
});

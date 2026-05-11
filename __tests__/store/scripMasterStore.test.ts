import { scripMasterStore } from '../../src/store/scripMasterStore';

describe('scripMasterStore', () => {
  it('should find scrips by underlying and expiry', () => {
    const scrips = [
      {
        token: '1',
        symbol: 'RELIANCE28MAY262500CE',
        name: 'RELIANCE',
        expiry: '28MAY2026',
        strike: '250000',
        exch_seg: 'NFO',
      },
      {
        token: '2',
        symbol: 'RELIANCE28MAY262600CE',
        name: 'RELIANCE',
        expiry: '28MAY2026',
        strike: '260000',
        exch_seg: 'NFO',
      },
      {
        token: '3',
        symbol: 'TCS28MAY263500CE',
        name: 'TCS',
        expiry: '28MAY2026',
        strike: '350000',
        exch_seg: 'NFO',
      },
    ];
    // @ts-expect-error - for testing purposes
    scripMasterStore.setScrips(scrips);

    const relianceScrips = scripMasterStore.getScripsByUnderlying(
      'RELIANCE',
      '28MAY2026',
    );
    expect(relianceScrips).toHaveLength(2);
    expect(relianceScrips[0].token).toBe('1');

    const empty = scripMasterStore.getScripsByUnderlying(
      'UNKNOWN',
      '28MAY2026',
    );
    expect(empty).toHaveLength(0);

    const wrongExpiry = scripMasterStore.getScripsByUnderlying(
      'RELIANCE',
      'wrong',
    );
    expect(wrongExpiry).toHaveLength(0);
  });
});

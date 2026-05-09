import { checkTrailingSl } from '../../src/helpers/trailingSlManager';

describe('trailingSlManager', () => {
  const netDebit = 100;
  const initialSl = 70;

  it('should not modify SL if MTM is below threshold', () => {
    const result = checkTrailingSl(1500, netDebit, initialSl, 0);
    expect(result.shouldModifySl).toBe(false);
    expect(result.newSlValue).toBe(initialSl);
  });

  it('should move SL to entry (Stage 1) when MTM >= 2000', () => {
    const result = checkTrailingSl(2000, netDebit, initialSl, 0);
    expect(result.shouldModifySl).toBe(true);
    expect(result.newSlValue).toBe(netDebit);
  });

  it('should move SL to lock 500 (Stage 2) when MTM >= 2500', () => {
    const result = checkTrailingSl(2500, netDebit, netDebit, 1);
    expect(result.shouldModifySl).toBe(true);
    expect(result.newSlValue).toBe(netDebit + 500);
  });

  it('should move SL to lock 1000 (Stage 3) when MTM >= 3000', () => {
    const result = checkTrailingSl(3000, netDebit, netDebit + 500, 2);
    expect(result.shouldModifySl).toBe(true);
    expect(result.newSlValue).toBe(netDebit + 1000);
  });

  it('should not move SL backwards if MTM drops', () => {
    const result = checkTrailingSl(2200, netDebit, netDebit + 500, 2);
    expect(result.shouldModifySl).toBe(false);
  });
});

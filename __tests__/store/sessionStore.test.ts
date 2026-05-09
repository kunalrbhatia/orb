import { sessionStore } from '../../src/store/sessionStore';

describe('sessionStore', () => {
  it('should manage session data', () => {
    const mockSession = {
      jwtToken: 'jwt',
      feedToken: 'feed',
      refreshToken: 'refresh',
    };
    sessionStore.setSession(mockSession);
    expect(sessionStore.getSession()).toEqual(mockSession);
    expect(sessionStore.jwtToken).toBe('jwt');
    expect(sessionStore.feedToken).toBe('feed');
  });
});

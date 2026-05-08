interface Session {
  jwtToken: string | null;
  feedToken: string | null;
  refreshToken: string | null;
}

class SessionStore {
  private session: Session = {
    jwtToken: null,
    feedToken: null,
    refreshToken: null,
  };

  setSession(session: Session): void {
    this.session = session;
  }

  getSession(): Session {
    return this.session;
  }

  get jwtToken(): string | null {
    return this.session.jwtToken;
  }

  get feedToken(): string | null {
    return this.session.feedToken;
  }
}

export const sessionStore = new SessionStore();

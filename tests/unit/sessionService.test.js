const sessionService = require("../../src/services/sessionService");
const config = require("../../src/config");

describe("SessionService", () => {
  beforeEach(() => {
    sessionService.sessions.clear();
  });

  test("should create a session with valid token", () => {
    const userId = "test_user";
    const token = sessionService.createSession(userId);
    
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    
    const session = sessionService.getSession(token);
    expect(session.userId).toBe(userId);
  });

  test("should return null for invalid token", () => {
    const session = sessionService.getSession("invalid_token");
    expect(session).toBeNull();
  });

  test("should delete session", () => {
    const token = sessionService.createSession("test_user");
    const deleted = sessionService.deleteSession(token);
    
    expect(deleted).toBe(true);
    expect(sessionService.getSession(token)).toBeNull();
  });

  test("should cleanup expired sessions", () => {
    const token = sessionService.createSession("test_user");
    
    const session = sessionService.sessions.get(token);
    session.expiresAt = Date.now() - 1000;
    sessionService.sessions.set(token, session);
    
    sessionService.cleanupExpiredSessions();
    
    expect(sessionService.getSession(token)).toBeNull();
  });
});
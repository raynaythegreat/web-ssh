const request = require("supertest");
const { app } = require("../../src/server");

describe("Authentication Integration", () => {
  test("POST /auth/login - should return token for valid password", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({ password: "changeme" })
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(response.body.token).toBeDefined();
  });

  test("POST /auth/login - should reject invalid password", async () => {
    const response = await request(app)
      .post("/auth/login")
      .send({ password: "wrongpassword" })
      .expect(401);
    
    expect(response.body.error).toBe("Invalid credentials");
  });

  test("GET /auth/status - should validate session", async () => {
    const loginRes = await request(app)
      .post("/auth/login")
      .send({ password: "changeme" });
    
    const token = loginRes.body.token;
    
    const statusRes = await request(app)
      .get("/auth/status")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    
    expect(statusRes.body.valid).toBe(true);
  });
});
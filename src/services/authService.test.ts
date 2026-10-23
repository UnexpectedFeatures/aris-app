import { describe, expect, it } from "vitest";
import { authenticateDemo } from "@/services/authService";

describe("demo authentication", () => {
  it("authenticates the administrator account without exposing its password", () => {
    const session = authenticateDemo(" ADMIN@ucc.edu.ph ", "Admin12345");

    expect(session.user.email).toBe("admin@ucc.edu.ph");
    expect(session.user.role).toBe("administrator");
    expect(session.user).not.toHaveProperty("password");
  });

  it("authenticates the professor account", () => {
    const session = authenticateDemo("professor@ucc.edu.ph", "Professor123");

    expect(session.user.role).toBe("professor");
  });

  it("authenticates the staff account", () => {
    const session = authenticateDemo("staff@ucc.edu.ph", "Staff12345");

    expect(session.user.role).toBe("staff");
    expect(session.user.staffStage).toBe("Secretary");
  });

  it("rejects unknown accounts and incorrect passwords", () => {
    expect(() => authenticateDemo("unknown@ucc.edu.ph", "Admin12345")).toThrow(
      "Email or password is incorrect.",
    );
    expect(() => authenticateDemo("admin@ucc.edu.ph", "wrong-password")).toThrow(
      "Email or password is incorrect.",
    );
  });
});

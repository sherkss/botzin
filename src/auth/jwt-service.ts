import jwt from "jsonwebtoken";
import type { RuntimeConfig } from "../config/runtime-config.js";
import type { AuthenticatedConfigUser, ConfigUserRole } from "../core/config-user.js";

interface ConfigJwtPayload extends jwt.JwtPayload {
  readonly username: string;
  readonly displayName: string;
  readonly role: ConfigUserRole;
}

export class JwtService {
  constructor(private readonly config: RuntimeConfig) {}

  sign(user: AuthenticatedConfigUser): string {
    this.assertSecret();
    return jwt.sign(
      {
        username: user.username,
        displayName: user.displayName,
        role: user.role
      },
      this.config.jwtSecret,
      {
        subject: String(user.id),
        expiresIn: this.config.jwtExpiresInSeconds,
        issuer: "botzin-config"
      }
    );
  }

  verify(token: string): AuthenticatedConfigUser {
    this.assertSecret();
    const payload = jwt.verify(token, this.config.jwtSecret, {
      issuer: "botzin-config"
    }) as ConfigJwtPayload;

    if (!payload.sub || !payload.username || !payload.displayName || !payload.role) {
      throw new Error("Invalid token payload.");
    }

    return {
      id: Number(payload.sub),
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role
    };
  }

  private assertSecret(): void {
    if (!this.config.jwtSecret || this.config.jwtSecret === "change-me-use-a-long-random-secret") {
      throw new Error("Configure BOTZIN_JWT_SECRET with a strong secret before using the configuration backend.");
    }
  }
}

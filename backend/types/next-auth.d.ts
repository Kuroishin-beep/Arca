/**
 * Auth.js carries Discord's user id through the token and onto the session.
 * Declaring it here rather than casting at each call site keeps
 * `session.discordId` a typed field instead of a string that happens to be
 * there.
 */
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    discordId?: string;
  }
  interface Profile {
    id?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    discordId?: string;
  }
}

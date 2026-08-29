/**
 * Auth.js (NextAuth v5) with Discord — SCOPE.md §4, M1.
 *
 * Discord because the campaign already coordinates there: there is no new
 * account for anyone to create, and a Discord id maps onto campaign membership
 * directly. That mapping is the `users.discord_id` column, which the schema has
 * carried a unique index on since the foundation commit.
 *
 * Two things this deliberately does NOT do:
 *
 *   - **No database adapter.** Auth.js keeps the login session in a JWT; Arca
 *     keeps the campaign's own membership. Letting Auth.js create rows in
 *     `users` would mean anyone who clicks "sign in with Discord" becomes a
 *     row in the campaign's user table, and membership would stop being the
 *     GM's decision. Identity is Discord's; authorisation stays Arca's.
 *   - **No role in the token.** The JWT carries a Discord id and nothing else
 *     that matters. Role comes from `campaign_members` on every request, so
 *     the GM demoting someone takes effect immediately rather than whenever
 *     that person's token happens to expire.
 */
import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

/**
 * Whether real auth is wired up.
 *
 * When it is not, `src/lib/session.ts` falls back to the member picker, which
 * is what makes `npm run dev` work with no database and no Discord app — the
 * property the README leads with. This is a development affordance and the
 * sign-in screen says so out loud; it is not a silent downgrade.
 */
export function authConfigured(): boolean {
  return Boolean(
    process.env.AUTH_DISCORD_ID &&
      process.env.AUTH_DISCORD_SECRET &&
      process.env.AUTH_SECRET,
  );
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Discord({
      clientId: process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.AUTH_DISCORD_SECRET,
      // `identify` alone. Arca needs to know which Discord account this is and
      // nothing else — not the user's email, not their guild list. Asking for
      // less is both the correct scope and a shorter consent screen.
      authorization: { params: { scope: "identify" } },
    }),
  ],

  session: { strategy: "jwt" },

  pages: {
    signIn: "/signin",
    error: "/signin",
  },

  callbacks: {
    /** Carry Discord's own id, which is what `users.discord_id` stores. */
    async jwt({ token, profile }) {
      if (profile?.id) token.discordId = String(profile.id);
      return token;
    },

    async session({ session, token }) {
      if (typeof token.discordId === "string") {
        session.discordId = token.discordId;
      }
      return session;
    },
  },
});

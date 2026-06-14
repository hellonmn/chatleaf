import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config (no Node-only imports). Used by middleware to decode the
 * session JWT. The real Credentials provider — which needs bcrypt/prisma/crypto —
 * is added in auth.ts, which runs only in the Node runtime.
 */
export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid && session.user) {
        session.user.id = token.uid as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

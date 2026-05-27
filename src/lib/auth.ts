// NextAuth configuration. Centralised so route handlers and `getServerSession`
// callers share the same setup. Credentials provider only by default — to
// enable GitHub OAuth, set GITHUB_ID/GITHUB_SECRET and uncomment the block
// below.

import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { logActivitySystem } from "@/lib/audit";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/signin",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;

        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });
        if (!user || !user.passwordHash) return null;
        // Polish P1.6 — deactivated users cannot start a new session.
        // Existing sessions stay valid until the JWT expires; the admin
        // UI's "deactivate" flow is documented as best-effort within the
        // session TTL.
        if (!user.isActive) return null;

        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          // Surface role to the session callback so middleware can branch on it.
          role: user.role,
        } as { id: string; email: string; name: string | null; role: string };
      },
    }),
    // GitHubProvider — uncomment after setting GITHUB_ID / GITHUB_SECRET.
    // GitHubProvider({
    //   clientId: process.env.GITHUB_ID!,
    //   clientSecret: process.env.GITHUB_SECRET!,
    // }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role?: string }).role ?? "user";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = (token.role as string) ?? "user";
      }
      return session;
    },
  },
  // Polish P5.3 — emit audit rows for sign-in / sign-out. We don't have a
  // TenantContext at the NextAuth hook level so we use logActivitySystem
  // (userId fixed to "system", tenantId null) and stash the actual userId
  // in `details`. The audit log UI surfaces both.
  events: {
    async signIn(message) {
      await logActivitySystem({
        action: "signin.success",
        entityType: "User",
        entityId: (message.user as { id?: string }).id,
        details: { email: message.user?.email ?? null, provider: message.account?.provider },
      });
    },
    async signOut(message) {
      const token = (message as { token?: { id?: string; email?: string } }).token;
      await logActivitySystem({
        action: "signout",
        entityType: "User",
        entityId: token?.id,
        details: { email: token?.email ?? null },
      });
    },
  },
};

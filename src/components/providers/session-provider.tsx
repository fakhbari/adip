"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

// Client-side wrapper for NextAuth's SessionProvider. Lets `signIn`,
// `signOut`, and `useSession` work in any child client component.
export function AuthSessionProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";

export default function SignOutPage() {
  useEffect(() => {
    signOut({ callbackUrl: "/auth/signin" });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
      Signing out…
    </div>
  );
}

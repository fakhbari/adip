"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/dashboard";

  const [email, setEmail] = useState("admin@local");
  const [password, setPassword] = useState("admin");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setSubmitting(false);
    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm space-y-4"
      >
        <div>
          <h1 className="text-2xl font-bold">Sign in to ADIP</h1>
          <p className="text-sm text-muted-foreground">
            Architecture Documentation Intelligence Platform
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        {error ? (
          <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>

        <p className="text-xs text-muted-foreground">
          Default admin seeded by <code>scripts/bootstrap.sh</code>:
          <br />
          <code>admin@local</code> / <code>admin</code> — change immediately in production.
        </p>
      </form>
    </div>
  );
}

export default function SignInPage() {
  // useSearchParams() requires a Suspense boundary in App Router.
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}

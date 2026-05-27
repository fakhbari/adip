"use client";

// Header search — Polish P2.2.
//
// Debounced 150 ms call to /api/search?q=… The popover shows up to 5
// repositories + 5 documents. Empty + short queries dismiss the popover.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, GitBranch, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";

type RepoHit = { id: string; name: string; description: string | null };
type DocHit = { id: string; type: string; title: string; repositoryId: string; repositoryName: string };

const DEBOUNCE_MS = 150;

export function HeaderSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ repositories: RepoHit[]; documents: DocHit[] } | null>(null);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Click-outside close.
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", fn);
    return () => window.removeEventListener("mousedown", fn);
  }, []);

  // Debounce + fetch.
  useEffect(() => {
    if (q.trim().length < 2) {
      // Defer to microtask so we never setState synchronously in the effect body.
      void Promise.resolve().then(() => setResults(null));
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        if (res.ok) {
          const data = (await res.json()) as { repositories: RepoHit[]; documents: DocHit[] };
          setResults(data);
          setOpen(true);
        }
      } catch {
        // network errors are silent here — the box stays empty.
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  const close = () => setOpen(false);

  return (
    <div ref={boxRef} className="relative hidden md:block">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search repositories, documents..."
        className="w-64 pl-8 lg:w-80"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results && setOpen(true)}
      />
      {open && results && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover p-2 shadow-md">
          {results.repositories.length === 0 && results.documents.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No matches.</p>
          ) : (
            <div className="space-y-2">
              {results.repositories.length > 0 && (
                <div>
                  <div className="px-2 text-xs uppercase tracking-wide text-muted-foreground">Repositories</div>
                  {results.repositories.map((r) => (
                    <Link
                      key={r.id}
                      href={`/repositories`}
                      onClick={close}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{r.name}</span>
                      {r.description && (
                        <span className="text-xs text-muted-foreground truncate">— {r.description}</span>
                      )}
                    </Link>
                  ))}
                </div>
              )}
              {results.documents.length > 0 && (
                <div>
                  <div className="px-2 text-xs uppercase tracking-wide text-muted-foreground">Documents</div>
                  {results.documents.map((d) => (
                    <Link
                      key={d.id}
                      href={`/repositories/${d.repositoryId}/runs`}
                      onClick={close}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{d.title}</span>
                      <span className="text-xs text-muted-foreground">— {d.repositoryName} · {d.type}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

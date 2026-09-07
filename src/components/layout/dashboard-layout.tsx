"use client";

import { ReactNode, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  GitBranch,
  Radar,
  FileText,
  Box,
  Settings,
  Activity,
  RefreshCw,
  Menu,
  Bell,
  Search,
  ChevronDown,
  Zap,
  FileCode,
  Network,
  Database,
  Radio,
  Users,
  ShieldCheck,
  Coins,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { HeaderSearch } from "@/components/layout/header-search";

// Phase 8: switched from a callback-driven `activeView` to App Router
// subroutes. Each nav item is now an `<href>` and active state derives from
// `usePathname()`, so refresh keeps you on the tab and URLs are bookmarkable.

interface DashboardLayoutProps {
  children: ReactNode;
}

const navigation = [
  {
    href: "/dashboard",
    name: "Dashboard",
    icon: LayoutDashboard,
    description: "Overview & Statistics",
  },
  {
    href: "/repositories",
    name: "Repositories",
    icon: GitBranch,
    description: "Manage repositories",
  },
  {
    href: "/settings",
    name: "Settings",
    icon: Settings,
    description: "System configuration",
  },
  // {
  //   href: "/radar",
  //   name: "Tech Radar",
  //   icon: Radar,
  //   description: "Technology radar",
  // },
  // {
  //   href: "/adr",
  //   name: "ADR",
  //   icon: FileText,
  //   description: "Architecture Decisions",
  // },
  // {
  //   href: "/c4",
  //   name: "C4 Docs",
  //   icon: Box,
  //   description: "C4 Documentation",
  // },
  // {
  //   href: "/openapi",
  //   name: "OpenAPI",
  //   icon: FileCode,
  //   description: "API Specifications",
  // },
  // {
  //   href: "/context-map",
  //   name: "Context Map",
  //   icon: Network,
  //   description: "DDD Bounded Contexts",
  // },
  // {
  //   href: "/asyncapi",
  //   name: "AsyncAPI",
  //   icon: Radio,
  //   description: "Event-driven specs",
  // },
  // {
  //   href: "/data-catalog",
  //   name: "Data Catalog",
  //   icon: Database,
  //   description: "ERD & data dictionary",
  // },
];

// Polish P1.6 / P1.7 / P1.8 / P6.4 — admin-only entries. Rendered as a
// separate section in the sidebar so non-admin users do not see them
// (we still 403 server-side via requireAdmin if they navigate manually).
// const adminNavigation = [
//   {
//     href: "/admin/users",
//     name: "Users",
//     icon: Users,
//     description: "Team & roles",
//   },
//   {
//     href: "/admin/audit",
//     name: "Audit Log",
//     icon: ShieldCheck,
//     description: "Activity history",
//   },
//   {
//     href: "/admin/usage",
//     name: "LLM Usage",
//     icon: Coins,
//     description: "Tokens & cost",
//   },
//   {
//     href: "/admin/notifications",
//     name: "Notifications",
//     icon: Send,
//     description: "Delivery log",
//   },
// ];

interface SidebarContentProps {
  pathname: string;
  onClose?: () => void;
  lastSync: Date | null;
  isSyncing: boolean;
  onSync: () => void;
  /** Polish P1.6 — admin entries render only when the session role is "admin". */
  isAdmin?: boolean;
}

function SidebarContent({ pathname, onClose, lastSync, isSyncing, onSync, isAdmin = false }: SidebarContentProps) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Zap className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-lg font-bold">ADIP</span>
          <span className="text-xs text-muted-foreground">Architecture Intelligence</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all hover:bg-accent",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
              <div className="flex flex-col items-start">
                <span>{item.name}</span>
                <span className="text-xs text-muted-foreground">{item.description}</span>
              </div>
            </Link>
          );
        })}

        {/*{isAdmin && (*/}
        {/*  <>*/}
        {/*    <div className="mt-4 mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">*/}
        {/*      Admin*/}
        {/*    </div>*/}
        {/*    {adminNavigation.map((item) => {*/}
        {/*      const isActive = pathname === item.href || pathname.startsWith(item.href + "/");*/}
        {/*      return (*/}
        {/*        <Link*/}
        {/*          key={item.href}*/}
        {/*          href={item.href}*/}
        {/*          onClick={onClose}*/}
        {/*          className={cn(*/}
        {/*            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all hover:bg-accent",*/}
        {/*            isActive*/}
        {/*              ? "bg-primary/10 text-primary"*/}
        {/*              : "text-muted-foreground hover:text-foreground"*/}
        {/*          )}*/}
        {/*        >*/}
        {/*          <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />*/}
        {/*          <div className="flex flex-col items-start">*/}
        {/*            <span>{item.name}</span>*/}
        {/*            <span className="text-xs text-muted-foreground">{item.description}</span>*/}
        {/*          </div>*/}
        {/*        </Link>*/}
        {/*      );*/}
        {/*    })}*/}
        {/*  </>*/}
        {/*)}*/}
      </nav>

      {/* Sync Status */}
      <div className="border-t p-4">
        <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-green-500" />
            <div className="flex flex-col">
              <span className="text-xs font-medium">Last Sync</span>
              <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                {lastSync ? lastSync.toLocaleTimeString() : "--:--:--"}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onSync}
            disabled={isSyncing}
          >
            <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname() ?? "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  // Polish P1.6 — only render the admin section when the JWT carries
  // role === "admin". The server-side requireAdmin() helper still
  // gates the actual data behind a 403, this is the UI affordance.
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  useEffect(() => {
    // Initialize lastSync on client side only
    const now = new Date();
    const timer = setTimeout(() => setLastSync(now), 0);
    return () => clearTimeout(timer);
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setLastSync(new Date());
    setIsSyncing(false);
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 border-r bg-card lg:block">
        <SidebarContent
          pathname={pathname}
          lastSync={lastSync}
          isSyncing={isSyncing}
          onSync={handleSync}
          isAdmin={isAdmin}
        />
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SidebarContent
            pathname={pathname}
            onClose={() => setMobileOpen(false)}
            lastSync={lastSync}
            isSyncing={isSyncing}
            onSync={handleSync}
            isAdmin={isAdmin}
          />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b bg-card px-4 lg:px-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>

            <HeaderSearch />
          </div>

          <div className="flex items-center gap-3">
            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5" />
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] text-destructive-foreground">
                    3
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="flex flex-col items-start gap-1">
                  <span className="font-medium">ADR Generated</span>
                  <span className="text-xs text-muted-foreground">
                    New ADR for auth-service
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex flex-col items-start gap-1">
                  <span className="font-medium">Documentation Updated</span>
                  <span className="text-xs text-muted-foreground">
                    C4 docs for payment-svc
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex flex-col items-start gap-1">
                  <span className="font-medium">Tech Radar Analysis</span>
                  <span className="text-xs text-muted-foreground">
                    5 new technologies detected
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>AD</AvatarFallback>
                  </Avatar>
                  <span className="hidden font-medium md:inline-block">Admin</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Profile</DropdownMenuItem>
                <DropdownMenuItem>Preferences</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/auth/signout">Sign out</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthSessionProvider } from "@/components/providers/session-provider";

// Build runs offline — Google Fonts (Geist / Geist Mono) cannot be fetched.
// Use locally bundled Liberation Sans / Mono instead. Same variable names so
// the rest of the stylesheet does not change (--font-geist-sans / -mono).
const geistSans = localFont({
  src: [
    { path: "./fonts/LiberationSans-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/LiberationSans-Italic.ttf", weight: "400", style: "italic" },
    { path: "./fonts/LiberationSans-Bold.ttf", weight: "700", style: "normal" },
    { path: "./fonts/LiberationSans-BoldItalic.ttf", weight: "700", style: "italic" },
  ],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = localFont({
  src: [
    { path: "./fonts/LiberationMono-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/LiberationMono-Italic.ttf", weight: "400", style: "italic" },
    { path: "./fonts/LiberationMono-Bold.ttf", weight: "700", style: "normal" },
    { path: "./fonts/LiberationMono-BoldItalic.ttf", weight: "700", style: "italic" },
  ],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ADIP - ArchDoc Intelligence Platform",
  description: "AI-powered Architecture Documentation Intelligence Platform for automated documentation generation and technology radar analysis.",
  keywords: ["Architecture", "Documentation", "AI", "ADR", "C4 Model", "Technology Radar", "Code Analysis"],
  authors: [{ name: "ADIP Team" }],
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
        suppressHydrationWarning
      >
        <AuthSessionProvider>
          <TooltipProvider>
            {children}
            <Toaster position="top-right" richColors />
          </TooltipProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}

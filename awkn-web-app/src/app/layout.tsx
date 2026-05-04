import "~/app/globals.css";

import { type Metadata, type Viewport } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";

import { TRPCReactProvider } from "~/trpc/react";

/**
 * Default metadata - customize these values for your project
 * Replace placeholders when scaffolding
 */
export const metadata: Metadata = {
  title: {
    default: "awkn-web-app",
    template: "%s | awkn-web-app",
  },
  description: "Multi-domain Next.js app for AWKN Ranch and Within Center",
  keywords: ["awkn-web-app", "web app", "Next.js"],
  authors: [{ name: "Matthew Miceli" }],
  creator: "Matthew Miceli",

  // OpenGraph
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "http://localhost:3000",
    siteName: "awkn-web-app",
    title: "awkn-web-app",
    description: "Multi-domain Next.js app for AWKN Ranch and Within Center",
    images: [
      {
        url: "http://localhost:3000/og-image.png",
        width: 1200,
        height: 630,
        alt: "awkn-web-app",
      },
    ],
  },

  // Twitter
  twitter: {
    card: "summary_large_image",
    title: "awkn-web-app",
    description: "Multi-domain Next.js app for AWKN Ranch and Within Center",
    images: ["http://localhost:3000/og-image.png"],
    // creator: "@yourhandle", // Uncomment and set your Twitter handle
  },

  // Icons
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },

  // Manifest for PWA (optional - create public/manifest.json)
  // manifest: "/manifest.json",

  // Robots
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geist.variable}`} suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem={true}
          disableTransitionOnChange
          storageKey="theme"
        >
          <TRPCReactProvider>{children}</TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

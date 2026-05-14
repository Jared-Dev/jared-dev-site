import "@mantine/core/styles.css";
import "./globals.css";

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from "@mantine/core";
import { theme } from "@/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://jareddev.com"),
  title: {
    default: "Jared Malcolm · Frontend Engineering",
    template: "%s · Jared Malcolm",
  },
  description:
    "14 years in software, frontend-focused with full-stack background. AI tooling is the daily driver, not a learning curve. Open to engineering leadership or senior IC.",
  openGraph: {
    type: "profile",
    siteName: "jareddev.com",
    url: "https://jareddev.com",
    title: "Jared Malcolm · Frontend Engineering",
    description:
      "Paste a job description and get an honest read on whether Jared fits. Leadership or senior IC, the eval is grounded in his actual profile.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Jared Malcolm · Frontend Engineering",
    description:
      "Paste a job description and get an honest read on whether Jared fits.",
  },
  alternates: {
    canonical: "https://jareddev.com",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" {...mantineHtmlProps} className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        <ColorSchemeScript forceColorScheme="dark" />
      </head>
      <body>
        <MantineProvider theme={theme} forceColorScheme="dark">
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}

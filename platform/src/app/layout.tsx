import { Rubik, JetBrains_Mono } from "next/font/google";
import { cookies, headers } from "next/headers";

import type { Metadata } from "next";

import { Footer } from "@/components/blocks/footer";
import { ConditionalNavbar } from "@/components/ConditionalNavbar";
import { LanguageProvider } from "@/components/providers/LanguageProvider";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ThemeInitializer } from "@/components/theme-initializer";
import { ThemeProvider } from "@/components/theme-provider";
import { APP_URL } from "@/lib/constants";
import { FeatureFlagsProvider } from "@/lib/features/client";
import { getServerFeatureFlags } from "@/lib/features/server";
import { LANGUAGE_COOKIE, pickLanguage } from "@/lib/locale";
import "@/styles/globals.css";

const rubik = Rubik({
  subsets: ["latin"],
  variable: "--font-rubik",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Iris — Engineering Intelligence for the AI Era",
    template: "%s | Iris",
  },
  description:
    "Measure what survives, not what ships. Engineering intelligence that analyzes code durability, stabilization, and AI impact across your repositories.",
  keywords: [
    "engineering intelligence",
    "code quality",
    "AI impact",
    "stabilization metrics",
    "developer experience",
    "code durability",
    "Iris",
  ],
  authors: [{ name: "Iris" }],
  creator: "Iris",
  publisher: "Iris",
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/favicon/favicon.ico", sizes: "48x48" },
      { url: "/favicon/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: [{ url: "/favicon/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: [{ url: "/favicon/favicon.ico" }],
  },
  manifest: "/favicon/site.webmanifest",
  openGraph: {
    title: "Iris — Engineering Intelligence for the AI Era",
    description:
      "Measure what survives, not what ships. Engineering intelligence for code durability and AI impact.",
    siteName: "Iris",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Iris — Engineering Intelligence for the AI Era",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Iris — Engineering Intelligence for the AI Era",
    description:
      "Measure what survives, not what ships. Engineering intelligence for code durability and AI impact.",
    images: ["/og-image.png"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const featureFlags = getServerFeatureFlags();
  const cookieStore = await cookies();
  const headerStore = await headers();
  const language = pickLanguage({
    cookie: cookieStore.get(LANGUAGE_COOKIE)?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });
  const htmlLang =
    language === "pt-BR" ? "pt-BR" : language === "es-ES" ? "es" : "en";

  return (
    <html lang={htmlLang} suppressHydrationWarning>
      <body
        className={`${rubik.variable} ${jetbrainsMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <FeatureFlagsProvider initialFlags={featureFlags}>
          <SessionProvider>
            <LanguageProvider initialLanguage={language}>
              <ThemeProvider
                attribute="class"
                defaultTheme="light"
                disableTransitionOnChange
              >
                <ThemeInitializer />
                <ConditionalNavbar />
                <main>{children}</main>
                <Footer />
              </ThemeProvider>
            </LanguageProvider>
          </SessionProvider>
        </FeatureFlagsProvider>
      </body>
    </html>
  );
}

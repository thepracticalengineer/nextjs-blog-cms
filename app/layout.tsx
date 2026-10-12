import type { Metadata } from "next";
import { Inter, Playfair_Display, DM_Sans } from "next/font/google";
import { Suspense } from "react";
import { Analytics } from "@/components/analytics/Analytics";
import { analyticsConfig } from "@/lib/analytics/policy";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "The Practical Engineer",
    template: "%s | The Practical Engineer",
  },
  description:
    "Practical knowledge for engineers who ship. Deep dives, guides, and architecture insights.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const analytics = analyticsConfig(process.env);
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body
        className={`${inter.className} ${playfair.variable} ${dmSans.variable}`}
      >
        <NextTopLoader showSpinner={false} />
        {children}
        {analytics && <Suspense fallback={null}><Analytics config={analytics} /></Suspense>}
      </body>
    </html>
  );
}

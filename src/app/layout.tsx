import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { buildWebSiteJsonLd, serializeJsonLd } from "@/lib/json-ld";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://plan.wtf'),
  title: {
    default: 'plan.wtf — Conference Side Events',
    template: '%s | plan.wtf',
  },
  description:
    'Browse and discover conference side events. Filter by date, time, tags, and more.',
  openGraph: {
    type: 'website',
    siteName: 'plan.wtf',
    title: 'plan.wtf — Conference Side Events',
    description:
      'Browse and discover conference side events. Filter by date, time, tags, and more.',
    url: 'https://plan.wtf',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'plan.wtf — Conference Side Events',
    description:
      'Browse and discover conference side events. Filter by date, time, tags, and more.',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const websiteJsonLd = buildWebSiteJsonLd();

  return (
    <html lang="en" data-theme="light-blue">
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('user-theme-override');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}})()` }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteJsonLd) }}
        />
      </head>
      <body className={`${inter.variable} antialiased`}>
        <Providers>{children}</Providers>
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-2WB3SFJ13V" strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-2WB3SFJ13V');
          `}
        </Script>
      </body>
    </html>
  );
}

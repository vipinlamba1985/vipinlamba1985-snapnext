import './globals.css';
import { Providers } from './providers';
import { Toaster } from 'sonner';

export const metadata = {
  title: 'SnapNext AI — Your memories, backed up, organized, AI-powered',
  description: 'Premium photo & video backup with AI captions, memories, and sharing. Like Google Photos + Instagram + iCloud.',
  manifest: '/manifest.json',
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://snapnext.ai'),
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/logo.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: 'SnapNext AI — Digital Life OS',
    description: 'Your memories, backed up, organized, and ready to share with AI.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'SnapNext AI official logo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SnapNext AI — Digital Life OS',
    description: 'Your memories, backed up, organized, and ready to share with AI.',
    images: ['/twitter-image.png'],
  },
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'SnapNext AI' },
};

export const viewport = {
  themeColor: '#0b0414',
  width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32" />
        <link rel="icon" href="/favicon-16x16.png" type="image/png" sizes="16x16" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="msapplication-TileColor" content="#0b0414" />
      </head>
      <body className="min-h-screen bg-[#0b0414] text-white antialiased" suppressHydrationWarning>
        <Providers>
          {children}
          <Toaster theme="dark" position="top-center" richColors />
        </Providers>
      </body>
    </html>
  );
}

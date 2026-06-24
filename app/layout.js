import './globals.css';
import { Providers } from './providers';
import { Toaster } from 'sonner';

export const metadata = {
  title: 'SnapNext AI — Your memories, backed up, organized, AI-powered',
  description: 'Premium photo & video backup with AI captions, memories, and sharing. Like Google Photos + Instagram + iCloud.',
  manifest: '/manifest.json',
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
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
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

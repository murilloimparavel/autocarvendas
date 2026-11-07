import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cookies } from 'next/headers'
import { LocaleProvider } from '@/features/i18n/LocaleProvider'
import { defaultLocale, isLocale, localeCookieName } from '@/features/i18n/messages'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies()
  const savedLocale = cookieStore.get(localeCookieName)?.value
  const locale = isLocale(savedLocale) ? savedLocale : defaultLocale
  return {
    title: "Openfront Dealership",
    description: locale === 'pt-BR'
      ? 'Estoque de veículos, CRM, vendas, test-drives, trocas, financiamento, oficina e entregas.'
      : 'Vehicle inventory, leads, deal desk, test drives, trade-ins, finance intake, service, and delivery.',
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies()
  const savedLocale = cookieStore.get(localeCookieName)?.value
  const locale = isLocale(savedLocale) ? savedLocale : defaultLocale
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link href="/favicon.svg" rel="icon" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background font-sans`}
      >
        <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}

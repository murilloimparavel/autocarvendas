import type { Metadata } from "next";
import { getRequestLocale } from '@/features/i18n/server'
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  return locale === 'pt-BR'
    ? { title: 'Painel AutoCarVendas', description: 'Gestão da loja, do estoque, das vendas, do CRM e da oficina.' }
    : { title: 'Openfront Dashboard', description: 'Admin interface for Openfront' }
}

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <Toaster />
    </ThemeProvider>
  );
}

import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { Header } from "./header";
import { RightSidebar } from "./right-sidebar";
import { useLocale } from '@/features/i18n/LocaleProvider'

const Sidebar = () => {
  const { locale } = useLocale()
  return (
    <SidebarProvider>
      <AppSidebar side="left" />
      <SidebarInset className="h-full overflow-hidden">
        <Header />
        <div className="p-4">{locale === 'pt-BR' ? 'Olá' : 'Hello'}</div>
      </SidebarInset>
      <RightSidebar side="right" />
    </SidebarProvider>
  );
};

export default Sidebar;

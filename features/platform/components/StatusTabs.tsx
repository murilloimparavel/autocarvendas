"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Segmented, type DeskTone } from "./desk";
import { useLocale } from '@/features/i18n/LocaleProvider'

const statusTone: Record<string, DeskTone> = {
  pending: "info",
  requires_action: "warn",
  completed: "ok",
  archived: "idle",
  canceled: "bad",
};

interface StatusTabsProps {
  statusCounts: {
    all: number;
    pending: number;
    requires_action: number;
    completed: number;
    archived: number;
    canceled: number;
  };
  statusConfig?: Record<string, { label: string; color: string }>;
  entityName?: string;
}

/** Underline status tabs bound to the `!status_matches` URL filter. */
export function StatusTabs({ statusCounts, entityName = "Items" }: StatusTabsProps) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const router = useRouter();
  const searchParams = useSearchParams()!;
  const pathname = usePathname();

  const statuses = [
    { value: "pending", label: pt ? "Pendente" : "Pending", count: statusCounts.pending },
    { value: "requires_action", label: pt ? "Requer ação" : "Requires action", count: statusCounts.requires_action },
    { value: "completed", label: pt ? "Concluído" : "Completed", count: statusCounts.completed },
    { value: "archived", label: pt ? "Arquivado" : "Archived", count: statusCounts.archived },
    { value: "canceled", label: pt ? "Cancelado" : "Canceled", count: statusCounts.canceled },
  ] as const;

  // Get current status from URL
  const statusFilter = searchParams.get("!status_matches");
  let currentStatus = "all";

  if (statusFilter) {
    try {
      const parsed = JSON.parse(decodeURIComponent(statusFilter));
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Handle both old object format and new string format
        currentStatus = typeof parsed[0] === "object" ? parsed[0].value : parsed[0];
      }
    } catch (e) {
      // Invalid JSON in URL, ignore
    }
  }

  const handleStatusChange = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status === "all") {
      params.delete("!status_matches");
    } else {
      params.set("!status_matches", JSON.stringify([status]));
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="px-4 md:px-6">
      <Segmented
        label={pt ? `Filtrar ${entityName.toLocaleLowerCase('pt-BR')} por status` : `Filter ${entityName.toLowerCase()} by status`}
        value={currentStatus}
        onChange={handleStatusChange}
        options={[
          { value: "all", label: pt ? `Todos: ${entityName}` : `All ${entityName}`, count: statusCounts.all },
          ...statuses.map((status) => ({
            value: status.value,
            label: status.label,
            count: status.count,
            tone: statusTone[status.value],
          })),
        ]}
      />
    </div>
  );
}

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getStoreSetupState } from "../actions/onboarding";
import { useLocale } from '@/features/i18n/LocaleProvider'

const DEALERSHIP_WELCOME_STEP = {
  title: "Welcome to Openfront Dealership",
  description: "Set up your dealership profile, inventory, service, parts, financing and staff roles.",
};

export interface OnboardingStep {
  href: string;
  title: string;
  description: string;
}

interface CommonCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const InfoCardTitle = React.memo(
  ({ children, className, ...props }: CommonCardProps) => {
    return (
      <div className={cn("font-medium mb-1", className)} {...props}>
        {children}
      </div>
    );
  }
);
InfoCardTitle.displayName = "InfoCardTitle";

const InfoCardDescription = React.memo(
  ({ children, className, ...props }: CommonCardProps) => {
    return (
      <div
        className={cn("text-muted-foreground leading-4", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
InfoCardDescription.displayName = "InfoCardDescription";

const InfoCardContent = React.memo(
  ({ children, className, ...props }: CommonCardProps) => {
    return (
      <div className={cn("flex flex-col gap-1 text-xs", className)} {...props}>
        {children}
      </div>
    );
  }
);
InfoCardContent.displayName = "InfoCardContent";

const InfoCardFooter = ({
  children,
  className,
}: CommonCardProps) => {
  return (
    <div
      className={cn(
        "flex justify-between text-xs text-muted-foreground mt-2",
        className
      )}
    >
      {children}
    </div>
  );
};

export function OnboardingCards({
  steps,
  onboardingStatus,
  onDismiss,
  onOpenDialog,
  userRole,
}: {
  steps: OnboardingStep[];
  onboardingStatus?: string;
  onDismiss: () => void;
  onOpenDialog?: () => void;
  userRole?: any;
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const [dismissedSteps] = React.useState<string[]>([]);
  // The shared sidebar passes the family welcome step; the dealership copy lives here.
  const cards = steps
    .filter(({ href }) => !dismissedSteps.includes(href))
    .map((step) => step.href === "#onboarding"
      ? (pt
        ? { ...step, title: 'Bem-vindo ao AutoCarVendas', description: 'Configure o perfil da revenda, o estoque, a oficina, as peças, o financiamento e as funções da equipe.' }
        : { ...step, ...DEALERSHIP_WELCOME_STEP })
      : step);
  const cardCount = cards.length;
  const [showCompleted, setShowCompleted] = React.useState(cardCount > 0);
  const [storeConfigured, setStoreConfigured] = React.useState<boolean | null>(null);
  const hidden = !userRole?.canManageOnboarding || onboardingStatus === "completed" || onboardingStatus === "dismissed";

  React.useEffect(() => {
    if (hidden) return;
    let active = true;
    getStoreSetupState()
      .then((state) => active && setStoreConfigured(!state.success || (state.configured && !state.resumable)))
      .catch(() => active && setStoreConfigured(true));
    return () => {
      active = false;
    };
  }, [hidden]);

  React.useEffect(() => {
    let timeout: NodeJS.Timeout | undefined = undefined;
    if (cardCount === 0)
      timeout = setTimeout(() => setShowCompleted(false), 2700);
    return () => clearTimeout(timeout);
  }, [cardCount]);

  // Don't show onboarding if user doesn't have permission
  if (!userRole?.canManageOnboarding) {
    return null;
  }

  if (onboardingStatus === "completed" || onboardingStatus === "dismissed") {
    return null;
  }

  // A dealership that is already set up (saved profile or members) does not get the setup card.
  // A run left in progress by a partial failure stays visible so it can be retried.
  if (storeConfigured !== false) {
    return null;
  }

  return cards.length || showCompleted ? (
    <div className="w-full">
      {cards.map(({ href, title, description }) => (
        <OnboardingCard
          key={href}
          title={title}
          description={description}
          onDismiss={onDismiss}
          onOpenDialog={onOpenDialog}
        />
      ))}
    </div>
  ) : null;
}

function OnboardingCard({
  title,
  description,
  onDismiss,
  onOpenDialog,
}: {
  title: string;
  description: string;
  onDismiss?: () => void;
  onOpenDialog?: () => void;
}) {
  const { locale } = useLocale()
  const pt = locale === 'pt-BR'
  const [isDismissed, setIsDismissed] = React.useState(false);

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  if (isDismissed) {
    return null;
  }

  return (
    <>
      {/* Full sidebar view */}
      <div
        className={cn(
          "group relative rounded-lg border bg-white dark:bg-black transition-all duration-300 ease-spring group-has-[[data-collapsible=icon]]/sidebar-wrapper:hidden",
          "opacity-100 translate-y-0",
          "hover:shadow-sm"
        )}
      >
        <div className="absolute -top-1 -right-1.5 z-10">
          <div className="h-3 w-3 rounded-full bg-blue-700 dark:bg-blue-400 border-blue-200 dark:border-blue-800/50 border-3 animate-pulse" />
        </div>
        <div className="flex items-start">
          <InfoCardContent className="pt-2 px-2">
            <InfoCardTitle>{title}</InfoCardTitle>
            <InfoCardDescription>{description}</InfoCardDescription>
          </InfoCardContent>
        </div>

        <InfoCardFooter>
          <div className="m-2 space-x-2">
            <Button size="sm" onClick={onOpenDialog} className="text-xs h-6">
              {pt ? 'Começar' : 'Get started'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="text-xs h-6"
            >
              {pt ? 'Pular por enquanto' : 'Skip for now'}
            </Button>
          </div>
        </InfoCardFooter>
      </div>

      {/* Icon-only sidebar view */}
      <div
        className={cn(
          "hidden group-has-[[data-collapsible=icon]]/sidebar-wrapper:block",
          "relative"
        )}
      >
        <div className="absolute -top-1 -right-1.5 z-10">
          <div className="h-3 w-3 rounded-full bg-blue-700 dark:bg-blue-400 border-blue-200 dark:border-blue-800/50 border-3 animate-pulse" />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={onOpenDialog}
        >
          <Rocket className="size-3" />
        </Button>
      </div>
    </>
  );
}

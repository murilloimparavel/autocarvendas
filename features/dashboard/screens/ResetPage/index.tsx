// Server Component
import { Logo } from "../../components/Logo";
import { ResetForm } from "./ResetForm";
import Link from "next/link";
import { passwordResetEmailAvailable } from "../../lib/authFlow";
import { getRequestLocale } from '@/features/i18n/server'
import { translate } from '@/features/i18n/messages'
import { LanguageSwitcher } from '@/features/i18n/LanguageSwitcher'

type ResetPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function ResetPage({ searchParams }: ResetPageProps) {
  const locale = await getRequestLocale()
  const t = (key: import('@/features/i18n/messages').MessageKey) => translate(locale, key)
  const resolvedSearchParams = await searchParams;
  const token =
    typeof resolvedSearchParams.token === "string"
      ? resolvedSearchParams.token
      : null;
  const mode = token ? "reset" : "request";
  const emailUnavailable = mode === "request" && !passwordResetEmailAvailable();

  return (
    <main className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center space-x-1.5">
          <Logo aria-hidden="true" />
        </div>
        <div className="mb-4 flex justify-end"><LanguageSwitcher /></div>
        <h1 className="mt-6 text-lg font-semibold text-foreground dark:text-foreground">
          {mode === "reset" ? t('resetYourPassword') : t('resetPasswordTitle')}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground">
          {mode === "reset"
            ? t('enterNewPassword')
            : emailUnavailable
              ? t('resetEmailUnavailable')
              : t('resetPasswordInstructions')}
        </p>

        {!emailUnavailable && <ResetForm mode={mode} token={token} />}
        <p className="mt-6 text-sm">
          <Link
            href="/dashboard/signin"
            className="font-medium text-primary hover:text-primary/90 dark:text-primary hover:dark:text-primary/90"
          >
            {t('backToSignIn')}
          </Link>
        </p>
      </div>
    </main>
  );
}

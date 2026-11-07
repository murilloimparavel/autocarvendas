// Server Component
import { Logo } from "../../components/Logo";
import { SignInForm } from "./SignInForm";
import Link from "next/link";
import { publicSignUpsAllowed } from "../../lib/authFlow";
import { getRequestLocale } from '@/features/i18n/server'
import { translate } from '@/features/i18n/messages'

type SignInPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function SignInPage({ searchParams }: SignInPageProps) {
  const locale = await getRequestLocale()
  const t = (key: import('@/features/i18n/messages').MessageKey) => translate(locale, key)
  const resolvedSearchParams = await searchParams;
  const from =
    typeof resolvedSearchParams.from === "string"
      ? resolvedSearchParams.from
      : "/dashboard";

  return (
    <main className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center space-x-1.5">
          <Logo aria-hidden="true" />
        </div>
        <h1 className="mt-6 text-lg font-semibold text-foreground dark:text-foreground">
          {t('signInToAccount')}
        </h1>
        {publicSignUpsAllowed() && (
          <p className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground">
            {t('noAccount')}
            <Link
              href="/dashboard/signup"
              className="ml-1 font-medium text-primary hover:text-primary/90 dark:text-primary hover:dark:text-primary/90"
            >
              {t('signUp')}
            </Link>
          </p>
        )}
        <SignInForm from={from} />
        <p className="mt-6 text-sm text-muted-foreground dark:text-muted-foreground">
          {t('forgotPassword')}
          <Link
            href="/dashboard/reset"
            className="ml-1 font-medium text-primary hover:text-primary/90 dark:text-primary hover:dark:text-primary/90"
          >
            {t('resetPassword')}
          </Link>
        </p>
      </div>
    </main>
  );
}

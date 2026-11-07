"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useActionState } from "react";
import { RiLoader2Fill } from "@remixicon/react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createInitialUser, signIn } from "@/features/dashboard/actions";
import { Logo } from "@/features/dashboard/components/Logo";
import { useLocale } from '@/features/i18n/LocaleProvider'
import { LanguageSwitcher } from '@/features/i18n/LanguageSwitcher'

type ActionState = {
  message: string | null;
  formData: {
    name: string;
    email: string;

  };
};

function SubmitButton() {
  const { pending } = useFormStatus();
  const { t } = useLocale()

  return (
    <Button
      type="submit"
      className="w-full py-2 font-medium"
      disabled={pending}
    >
      {pending ? (
        <RiLoader2Fill className="size-4 shrink-0 animate-spin" />
      ) : (
        t('createAccount')
      )}
    </Button>
  );
}

const initialState: ActionState = {
  message: null,
  formData: {
    name: "",
    email: "",

  },
};

export function InitPage() {
  const { t } = useLocale()
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction] = useActionState(
    async (prevState: ActionState, formData: FormData) => {
      const result = await createInitialUser(prevState, formData);

      if ("message" in result && result.message) {
        return {
          message: result.message,
          formData: {
            name: formData.get("name") as string,
            email: formData.get("email") as string,
          },
        };
      }

      // If successful, sign in the user
      await signIn(
        {
          message: null,
          formData: {
            email: formData.get("email") as string,
          },
        },
        formData
      );

      return {
        message: null,
        formData: {
          name: formData.get("name") as string,
          email: formData.get("email") as string,
        },
      };
    },
    initialState
  );

  return (
    <main className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex items-center space-x-1.5">
          <Logo aria-hidden="true" />
        </div>
        <div className="mb-4 flex justify-end"><LanguageSwitcher /></div>
        <h1 className="mt-6 text-lg font-semibold text-foreground dark:text-foreground">
          {t('adminAccountTitle')}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground dark:text-muted-foreground">
          {t('adminAccountDescription')}
        </p>

        <form action={formAction} className="mt-8 space-y-4">
          <div>
            <Label
              htmlFor="name"
              className="text-sm font-medium text-foreground dark:text-foreground"
            >
              {t('fullName')}
            </Label>
            <Input
              type="text"
              id="name"
              name="name"
              autoComplete="name"
              placeholder={t('enterYourName')}
              className="mt-2 bg-muted/40"
              defaultValue={state.formData.name}
              required
            />
          </div>
          <div>
            <Label
              htmlFor="email"
              className="text-sm font-medium text-foreground dark:text-foreground"
            >
              {t('email')}
            </Label>
            <Input
              type="email"
              id="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              className="mt-2 bg-muted/40"
              defaultValue={state.formData.email}
              required
            />
          </div>
          <div>
            <Label
              htmlFor="password"
              className="text-sm font-medium text-foreground dark:text-foreground"
            >
              {t('password')}
            </Label>
            <div className="relative mt-2">
              <Input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                autoComplete="new-password"
                placeholder="••••••••"
                className="pr-10 bg-muted/40"

                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-500"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="sr-only">{showPassword ? t('hidePassword') : t('showPassword')}</span>
              </button>
            </div>
          </div>
          <SubmitButton />
        </form>

        {state.message && (
          <Badge
            variant="destructive"
            className="hover:bg-destructive/10 bg-destructive/5 flex text-base items-start gap-2 border border-destructive/50 p-4 rounded-sm mt-4"
          >
            <div className="flex flex-col gap-1">
              <h2 className="uppercase tracking-wider font-semibold text-sm">
                {t('error')}
              </h2>
              <span className="break-all text-sm opacity-75 font-normal">
                {state.message}
              </span>
            </div>
          </Badge>
        )}
      </div>
    </main>
  );
}

export default InitPage;

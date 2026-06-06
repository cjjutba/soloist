"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { acceptInviteAction } from "@/server/auth/accept-invite.actions";

const FormSchema = z.object({
  password: z.string().min(8, "Use at least 8 characters."),
});
type FormValues = z.infer<typeof FormSchema>;

/** Set-password form for the pre-auth invite accept (Story 2.4). On success the action has
 * signed the Client in (cookie set on the response) → navigate to /portal. The submit button
 * wears the inherited `--tenant-accent` (a Client-facing surface). */
export function AcceptForm({ token }: { token: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { password: "" },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    let res;
    try {
      res = await acceptInviteAction({ token, password: values.password });
    } catch {
      setFormError("Something went wrong. Please try again.");
      return;
    }
    if (res.ok) {
      router.push("/portal");
      router.refresh();
      return;
    }
    setFormError(res.error);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex w-full flex-col gap-4" noValidate>
      <Field
        label="Set a password"
        htmlFor="password"
        hint="At least 8 characters."
        error={errors.password?.message}
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          {...register("password")}
        />
      </Field>
      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}
      <Button
        type="submit"
        loading={isSubmitting}
        className="bg-[var(--tenant-accent)] text-[var(--tenant-accent-foreground)] hover:opacity-90"
      >
        Enter portal
      </Button>
    </form>
  );
}

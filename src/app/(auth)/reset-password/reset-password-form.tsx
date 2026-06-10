"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { resetPassword } from "@/server/auth/client";

const FormSchema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters."),
    confirm: z.string().min(1, "Re-enter your password."),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Passwords don't match.",
  });
type FormValues = z.infer<typeof FormSchema>;

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { password: "", confirm: "" },
  });

  async function onSubmit(values: FormValues) {
    setFormError(null);
    let error;
    try {
      ({ error } = await resetPassword({ newPassword: values.password, token }));
    } catch {
      setFormError("Something went wrong. Please try again.");
      return;
    }
    if (error) {
      // The token expired (or was already used) between opening the email and submitting.
      setFormError("This reset link is invalid or expired. Request a new one to continue.");
      return;
    }
    // No auto sign-in (matches the app's autoSignIn: false) — send them to log in fresh.
    toast.success("Password updated. Log in with your new password.");
    router.push("/login");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>Choose a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <Field
            label="New password"
            htmlFor="password"
            hint="At least 8 characters."
            error={errors.password?.message}
          >
            <PasswordInput
              id="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
          </Field>
          <Field label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}>
            <PasswordInput
              id="confirm"
              autoComplete="new-password"
              aria-invalid={!!errors.confirm}
              {...register("confirm")}
            />
          </Field>
          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}
          <Button type="submit" loading={isSubmitting} className="mt-2">
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

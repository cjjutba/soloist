"use client";

import { useState } from "react";
import Link from "next/link";
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
import { Input } from "@/components/ui/input";
import { requestPasswordReset } from "@/server/auth/client";

const FormSchema = z.object({
  email: z.string().email("Enter a valid email."),
});
type FormValues = z.infer<typeof FormSchema>;

export function ForgotPasswordForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: FormValues) {
    try {
      await requestPasswordReset({ email: values.email, redirectTo: "/reset-password" });
    } catch {
      // A thrown error here is a transport/server failure, not "no such account" — Better
      // Auth returns an identical successful response either way (no account enumeration).
      toast.error("Something went wrong. Please try again.");
      return;
    }
    // Always land on the neutral confirmation, whether or not the address is registered.
    setSentTo(values.email);
  }

  if (sentTo) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Check your inbox</CardTitle>
          <CardDescription>
            If an account exists for <strong>{sentTo}</strong>, we&apos;ve sent a link to
            reset your password. It expires in 1 hour.
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6 text-center text-sm text-muted-foreground">
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Back to log in
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Forgot password</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a link to reset your password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
          </Field>
          <Button type="submit" loading={isSubmitting} className="mt-2">
            Send reset link
          </Button>
        </form>
      </CardContent>
      <div className="px-6 pb-6 text-center text-sm text-muted-foreground">
        Remember your password?{" "}
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Log in
        </Link>
      </div>
    </Card>
  );
}

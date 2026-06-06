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
import { Input } from "@/components/ui/input";
import { authClient } from "@/server/auth/client";

const NameSchema = z.object({ name: z.string().trim().min(1, "Enter your name.").max(100) });
const EmailSchema = z.object({ newEmail: z.string().trim().email("Enter a valid email.") });
const PasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string().min(8, "Use at least 8 characters."),
});

export function AccountForm({
  initialName,
  currentEmail,
}: {
  initialName: string;
  currentEmail: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <NameForm initialName={initialName} />
      <EmailForm currentEmail={currentEmail} />
      <PasswordForm />
    </div>
  );
}

function NameForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof NameSchema>>({
    resolver: zodResolver(NameSchema),
    defaultValues: { name: initialName },
  });

  async function onSubmit(values: { name: string }) {
    try {
      const { error } = await authClient.updateUser({ name: values.name });
      if (error) {
        toast.error("Couldn't update your name. Please try again.");
        return;
      }
      toast.success("Name updated.");
      router.refresh();
    } catch {
      toast.error("Something went wrong. Please try again.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Name</CardTitle>
        <CardDescription>Shown in your Cockpit.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <Field label="Display name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register("name")} />
          </Field>
          <Button type="submit" loading={isSubmitting} className="self-start">
            Save name
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function EmailForm({ currentEmail }: { currentEmail: string }) {
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof EmailSchema>>({
    resolver: zodResolver(EmailSchema),
    defaultValues: { newEmail: "" },
  });

  async function onSubmit(values: { newEmail: string }) {
    if (values.newEmail.toLowerCase() === currentEmail.toLowerCase()) {
      setError("newEmail", { message: "That's already your email." });
      return;
    }
    try {
      const { error } = await authClient.changeEmail({
        newEmail: values.newEmail,
        callbackURL: "/app/settings/account",
      });
      if (error) {
        toast.error("Couldn't start the email change. Please try again.");
        return;
      }
      // Always the same response whether or not the address is taken (anti-enumeration).
      setSent(true);
    } catch {
      toast.error("Something went wrong. Please try again.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Email</CardTitle>
        <CardDescription>
          Currently <span className="font-medium text-foreground">{currentEmail}</span>. A change
          takes effect after you confirm the new address.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground" role="status">
              Check your new inbox — we sent a link to confirm the change.
            </p>
            <button
              type="button"
              className="text-sm font-medium text-foreground underline underline-offset-4"
              onClick={() => {
                reset();
                setSent(false);
              }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <Field label="New email" htmlFor="newEmail" error={errors.newEmail?.message}>
              <Input
                id="newEmail"
                type="email"
                autoComplete="email"
                aria-invalid={!!errors.newEmail}
                {...register("newEmail")}
              />
            </Field>
            <Button type="submit" loading={isSubmitting} className="self-start">
              Change email
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function PasswordForm() {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof PasswordSchema>>({
    resolver: zodResolver(PasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });

  async function onSubmit(values: { currentPassword: string; newPassword: string }) {
    try {
      const { error } = await authClient.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        revokeOtherSessions: true,
      });
      if (error) {
        // The new password is client-validated (min 8), so a 400 / INVALID_PASSWORD is the
        // wrong current password → surface on that field. Anything else → generic toast.
        if (error.code === "INVALID_PASSWORD" || error.status === 400) {
          setError("currentPassword", { message: "That password is incorrect." });
        } else {
          toast.error("Couldn't change your password. Please try again.");
        }
        return;
      }
      toast.success("Password changed. Other sessions were signed out.");
      reset();
    } catch {
      toast.error("Something went wrong. Please try again.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Password</CardTitle>
        <CardDescription>
          Changing it signs you out of other devices. Use at least 8 characters.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <Field
            label="Current password"
            htmlFor="currentPassword"
            error={errors.currentPassword?.message}
          >
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.currentPassword}
              {...register("currentPassword")}
            />
          </Field>
          <Field label="New password" htmlFor="newPassword" error={errors.newPassword?.message}>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.newPassword}
              {...register("newPassword")}
            />
          </Field>
          <Button type="submit" loading={isSubmitting} className="self-start">
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

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
import { PasswordInput } from "@/components/ui/password-input";
import { validateSlug } from "@/lib/slug";
import { signUpFreelancer } from "./actions";

const FormSchema = z.object({
  name: z.string().min(1, "Enter your name."),
  email: z.string().email("Enter a valid email."),
  password: z.string().min(8, "Use at least 8 characters."),
  // Single source of truth: the same validateSlug the server uses (slug.ts is pure /
  // client-safe), so the form never accepts a slug the server will reject.
  slug: z.string().superRefine((val, ctx) => {
    const r = validateSlug(val);
    if (!r.ok) {
      ctx.addIssue({
        code: "custom",
        message:
          r.reason === "reserved"
            ? "That workspace name is reserved — pick another."
            : "Use 3–63 lowercase letters, numbers, and single hyphens.",
      });
    }
  }),
});
type FormValues = z.infer<typeof FormSchema>;

export function SignUpForm() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { name: "", email: "", password: "", slug: "" },
  });

  async function onSubmit(values: FormValues) {
    let res;
    try {
      res = await signUpFreelancer(values);
    } catch {
      // The action is designed to always return a SignUpResult; a throw here is a
      // transport/server crash — surface it instead of leaving the button spinning.
      toast.error("Something went wrong. Please try again.");
      return;
    }
    if (res.ok) {
      setSentTo(values.email);
      return;
    }
    const fe = res.fieldErrors;
    let focused = false;
    for (const key of Object.keys(fe) as (keyof typeof fe)[]) {
      if (key === "form") {
        toast.error(fe.form!);
        continue;
      }
      setError(key as keyof FormValues, { message: fe[key] }, { shouldFocus: !focused });
      focused = true;
    }
  }

  if (sentTo) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>
            We sent a verification link to <strong>{sentTo}</strong>. Confirm it to
            activate your workspace, then you&apos;ll land in your Cockpit.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Create your workspace</CardTitle>
        <CardDescription>Run solo. Deliver like an agency.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <Field label="Name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" autoComplete="name" aria-invalid={!!errors.name} {...register("name")} />
          </Field>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
          </Field>
          <Field label="Password" htmlFor="password" error={errors.password?.message}>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
          </Field>
          <Field
            label="Workspace ID"
            htmlFor="slug"
            hint="Your internal identifier — lowercase letters, numbers, and hyphens."
            error={errors.slug?.message}
          >
            <Input
              id="slug"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={!!errors.slug}
              {...register("slug")}
            />
          </Field>
          <Button type="submit" loading={isSubmitting} className="mt-2">
            Create workspace
          </Button>
        </form>
      </CardContent>
      <div className="px-6 pb-6 text-center text-sm text-muted-foreground">
        Already have a workspace?{" "}
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

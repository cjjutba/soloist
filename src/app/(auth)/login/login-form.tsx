"use client";

import Link from "next/link";
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
import { signIn } from "@/server/auth/client";

const FormSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(1, "Enter your password."),
});
type FormValues = z.infer<typeof FormSchema>;

export function LoginForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    let error;
    try {
      ({ error } = await signIn.email({ email: values.email, password: values.password }));
    } catch {
      toast.error("Something went wrong. Please try again.");
      return;
    }
    if (error) {
      // requireEmailVerification blocks unverified sign-in (and resends the link).
      if (error.code === "EMAIL_NOT_VERIFIED") {
        toast.error("Verify your email — we've sent a fresh link to your inbox.");
      } else {
        // Generic, non-enumerating message for bad credentials.
        toast.error("Invalid email or password.");
      }
      return;
    }
    // Route to "/" — the role router sends a Freelancer to /app and a Client to /portal,
    // so ONE login serves both. (The role is derived server-side, not on the client.)
    router.push("/");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>
          Welcome back. Freelancers reach their Cockpit, clients their portal.
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
          <Field label="Password" htmlFor="password" error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
          </Field>
          <Button type="submit" loading={isSubmitting} className="mt-2">
            Log in
          </Button>
        </form>
      </CardContent>
      <div className="px-6 pb-6 text-center text-sm text-muted-foreground">
        Need an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Create one
        </Link>
      </div>
    </Card>
  );
}

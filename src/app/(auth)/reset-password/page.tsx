import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Reset password · Soloist" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;

  // Better Auth validates the emailed link server-side, then redirects here with either a
  // usable `?token=…` or `?error=INVALID_TOKEN` (stale/used link). No token at all → same
  // dead end. Nothing to reset in either case.
  if (error || !token) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>This link is invalid or expired</CardTitle>
          <CardDescription>
            Password reset links expire after 1 hour and can be used once. Request a fresh
            one to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/forgot-password"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Request a new link
          </Link>
        </CardContent>
      </Card>
    );
  }

  return <ResetPasswordForm token={token} />;
}

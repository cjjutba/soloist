"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
// global-error replaces the root layout, so it must pull in the stylesheet itself.
import "./globals.css";

// Catches errors that escape the root layout. Reports to Sentry + renders a neutral
// fallback (it replaces the root layout, so it owns <html>/<body>).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="max-w-md text-sm text-gray-500">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={() => reset()}
          className="mt-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium"
        >
          Try again
        </button>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up · Soloist" };

export default function SignUpPage() {
  return <SignUpForm />;
}

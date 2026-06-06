"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { buttonVariants, Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_LABELS } from "@/components/ui/badge";
import { ENGAGEMENT_STATUSES } from "@/server/engagements/engagements.schema";
import {
  createEngagementAction,
  updateEngagementAction,
} from "@/server/engagements/engagements.actions";

// Client-side mirror of the server Zod rules (the server remains authoritative).
const FormSchema = z.object({
  name: z.string().trim().min(1, "Give the engagement a name.").max(120, "Keep it under 120 characters."),
  clientDisplayName: z
    .string()
    .trim()
    .min(1, "Add the client's name as it should appear to them.")
    .max(120, "Keep it under 120 characters."),
  scope: z.string().trim().max(2000, "Keep the scope under 2000 characters."),
  status: z.enum(ENGAGEMENT_STATUSES),
});
type FormValues = z.infer<typeof FormSchema>;

type Props =
  | { mode: "create" }
  | {
      mode: "edit";
      id: string;
      initial: { name: string; clientDisplayName: string; scope: string | null; status: string };
    };

export function EngagementForm(props: Props) {
  const router = useRouter();
  const isEdit = props.mode === "edit";
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: isEdit
      ? {
          name: props.initial.name,
          clientDisplayName: props.initial.clientDisplayName,
          scope: props.initial.scope ?? "",
          status: (ENGAGEMENT_STATUSES as readonly string[]).includes(props.initial.status)
            ? (props.initial.status as FormValues["status"])
            : "active",
        }
      : { name: "", clientDisplayName: "", scope: "", status: "active" },
  });

  async function onSubmit(values: FormValues) {
    try {
      const res = isEdit
        ? await updateEngagementAction(props.id, {
            name: values.name,
            clientDisplayName: values.clientDisplayName,
            scope: values.scope,
            status: values.status,
          })
        : await createEngagementAction({
            name: values.name,
            clientDisplayName: values.clientDisplayName,
            scope: values.scope,
          });
      if (res.ok) {
        toast.success(isEdit ? "Engagement saved." : "Engagement created.");
        router.push("/app");
        router.refresh();
        return;
      }
      // The server returns a single generic/field-agnostic message; surface it as a
      // toast rather than pinning it (and focus) onto the unrelated `name` field.
      toast.error(res.error);
    } catch {
      toast.error("Something went wrong. Please try again.");
    }
  }

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>{isEdit ? "Edit engagement" : "New engagement"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <Field label="Engagement name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" autoComplete="off" aria-invalid={!!errors.name} {...register("name")} />
          </Field>
          <Field
            label="Client display name"
            htmlFor="clientDisplayName"
            hint="How the client's name appears to them in their portal."
            error={errors.clientDisplayName?.message}
          >
            <Input
              id="clientDisplayName"
              autoComplete="off"
              aria-invalid={!!errors.clientDisplayName}
              {...register("clientDisplayName")}
            />
          </Field>
          <Field label="Scope (optional)" htmlFor="scope" error={errors.scope?.message}>
            <Textarea id="scope" aria-invalid={!!errors.scope} {...register("scope")} />
          </Field>

          {isEdit ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                className="flex h-10 w-full rounded-[var(--radius-md)] border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                {...register("status")}
              >
                {ENGAGEMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="mt-2 flex items-center gap-3">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : isEdit ? "Save changes" : "Create engagement"}
            </Button>
            <Link href="/app" className={buttonVariants({ variant: "ghost" })}>
              Cancel
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

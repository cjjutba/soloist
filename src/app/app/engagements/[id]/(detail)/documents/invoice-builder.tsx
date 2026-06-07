"use client";

import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createInvoiceAction } from "@/server/doc-engine/invoice.actions";
import { formatMoney, toMinorUnits } from "@/server/doc-engine/money";

// A small currency set for v1 (default PHP — CJ's locale; selectable for international clients).
const CURRENCIES = ["PHP", "USD", "EUR", "GBP", "AUD", "SGD", "JPY"] as const;

type Row = { description: string; quantity: string; unitAmount: string };
const emptyRow = (): Row => ({ description: "", quantity: "1", unitAmount: "" });
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Create a Draft Invoice (Story 5.1) — an inline panel (no Dialog dependency, mirrors ManualUpdate).
 * Bill-to is prefilled from the Engagement (read-only, FR-17). Amounts are typed in MAJOR units and
 * converted to integer minor units before submit; the live total is display-only (the server
 * recomputes authoritatively). The `numeric` (font-mono, tabular) token carries every amount.
 */
export function InvoiceBuilder({ engagementId, clientName }: { engagementId: string; clientName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [currency, setCurrency] = useState<string>("PHP");
  const [issuedAt, setIssuedAt] = useState(today());
  const [dueAt, setDueAt] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const firstDescRef = useRef<HTMLInputElement>(null);

  function openForm() {
    setOpen(true);
    requestAnimationFrame(() => firstDescRef.current?.focus());
  }

  function reset() {
    setCurrency("PHP");
    setIssuedAt(today());
    setDueAt("");
    setNotes("");
    setRows([emptyRow()]);
    setOpen(false);
  }

  function setRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  // Live total (display-only) — major→minor per the chosen currency, one round per line.
  const totalMinor = rows.reduce((sum, r) => {
    const q = Number(r.quantity);
    const unitMinor = toMinorUnits(Number(r.unitAmount), currency);
    if (!Number.isFinite(q) || !Number.isFinite(unitMinor) || !r.unitAmount) return sum;
    return sum + Math.round(q * unitMinor);
  }, 0);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    // A row the user never touched (both blank) is ignored; any row they STARTED must be complete —
    // so a half-filled line is never silently dropped (it blocks submit with a clear message instead).
    const intended = rows.filter((r) => !(r.description.trim() === "" && r.unitAmount.trim() === ""));
    if (intended.length === 0) {
      toast.error("Add at least one line item.");
      return;
    }
    const allValid = intended.every((r) => {
      const q = Number(r.quantity);
      const amt = Number(r.unitAmount);
      return (
        r.description.trim() !== "" &&
        r.unitAmount.trim() !== "" &&
        Number.isFinite(amt) &&
        amt >= 0 &&
        Number.isFinite(q) &&
        q > 0
      );
    });
    if (!allValid) {
      toast.error("Each line needs a description, a positive quantity, and an amount.");
      return;
    }
    const lineItems = intended.map((r) => ({
      description: r.description.trim(),
      quantity: Number(r.quantity),
      unitAmount: toMinorUnits(Number(r.unitAmount), currency),
    }));
    setBusy(true);
    const res = await createInvoiceAction({
      engagementId,
      lineItems,
      currency,
      issuedAt,
      dueAt: dueAt || null,
      notes: notes.trim() || null,
    });
    if (res.ok) {
      toast.success(`Invoice created (draft).`);
      reset();
      router.refresh();
    } else {
      toast.error(res.error);
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <Button size="sm" onClick={openForm}>
        New invoice
      </Button>
    );
  }

  return (
    <Card className="w-full p-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Billing <span className="font-medium text-foreground">{clientName}</span>
        </p>

        {/* Line items. */}
        <div className="flex flex-col gap-2" role="group" aria-label="Line items">
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div className="min-w-40 flex-1">
                <Label htmlFor={`desc-${i}`} className="sr-only">
                  Description
                </Label>
                <Input
                  id={`desc-${i}`}
                  ref={i === 0 ? firstDescRef : undefined}
                  value={r.description}
                  onChange={(e) => setRow(i, { description: e.target.value })}
                  placeholder="Description"
                  maxLength={500}
                />
              </div>
              <div className="w-16">
                <Label htmlFor={`qty-${i}`} className="sr-only">
                  Quantity
                </Label>
                <Input
                  id={`qty-${i}`}
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={r.quantity}
                  onChange={(e) => setRow(i, { quantity: e.target.value })}
                  className="text-right font-mono"
                  aria-label="Quantity"
                />
              </div>
              <div className="w-28">
                <Label htmlFor={`unit-${i}`} className="sr-only">
                  Unit amount
                </Label>
                <Input
                  id={`unit-${i}`}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={r.unitAmount}
                  onChange={(e) => setRow(i, { unitAmount: e.target.value })}
                  placeholder="0.00"
                  className="text-right font-mono"
                  aria-label="Unit amount"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs))}
                disabled={rows.length === 1}
                aria-label={`Remove line ${i + 1}`}
                className="min-h-9"
              >
                ✕
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRows((rs) => [...rs, emptyRow()])}
            className="self-start"
          >
            + Add line
          </Button>
        </div>

        {/* Currency · dates. */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="currency">Currency</Label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={cn(
                "h-9 rounded-[var(--radius-md)] border border-input bg-transparent px-3 text-sm shadow-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="issued">Issued</Label>
            <Input id="issued" type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="due">Due (optional)</Label>
            <Input id="due" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="w-40" />
          </div>
          <div className="ml-auto flex flex-col items-end gap-1">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="font-mono text-lg font-semibold">{formatMoney(totalMinor, currency)}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Payment terms, a thank-you, anything for the client."
            className="min-h-16"
            maxLength={2000}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" loading={busy}>
            Create draft
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

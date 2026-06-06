"use client";

import { type CSSProperties, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveAccent, uploadLogo } from "@/server/branding/branding.actions";
import { resolveBrandingVars } from "@/server/branding/branding-vars";
import { DEFAULT_ACCENT, deriveAccentText, HEX_RE } from "@/server/branding/contrast";

export function BrandingForm({
  tenantName,
  initialAccent,
  initialLogoUrl,
}: {
  tenantName: string;
  initialAccent: string | null;
  initialLogoUrl: string | null;
}) {
  const router = useRouter();
  const [accent, setAccent] = useState(initialAccent ?? DEFAULT_ACCENT);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [savingAccent, setSavingAccent] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Live preview: derive the (decoupled) text token client-side so the sample updates as
  // the color changes — the server re-derives + persists the authoritative value on save.
  const previewText = HEX_RE.test(accent) ? deriveAccentText(accent) : DEFAULT_ACCENT;
  const vars = resolveBrandingVars(
    { accentHex: HEX_RE.test(accent) ? accent : DEFAULT_ACCENT, accentTextHex: previewText, logoBlobUrl: logoUrl },
    tenantName,
  );

  async function onSaveAccent() {
    if (!HEX_RE.test(accent)) {
      setError("Use a 6-digit hex color like #5B5BD6.");
      setSuggestion(null);
      return;
    }
    setSavingAccent(true);
    try {
      const res = await saveAccent({ accentHex: accent });
      if (res.ok) {
        setError(null);
        setSuggestion(null);
        toast.success("Accent saved.");
        router.refresh();
      } else {
        setError(res.error);
        setSuggestion(res.suggestion ?? null);
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setSavingAccent(false);
    }
  }

  async function onUploadLogo() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Choose a logo file first.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("logo", file);
      const res = await uploadLogo(fd);
      if (res.ok) {
        setLogoUrl(res.url);
        if (fileRef.current) fileRef.current.value = ""; // clear so the same file isn't re-uploaded
        toast.success("Logo uploaded.");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Controls */}
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Accent color</CardTitle>
            <CardDescription>
              Used for buttons, links, and highlights on your client surfaces.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Label htmlFor="accent">Color</Label>
            <div className="flex items-center gap-3">
              <input
                id="accent"
                type="color"
                aria-label="Accent color picker"
                value={HEX_RE.test(accent) ? accent : DEFAULT_ACCENT}
                onChange={(e) => {
                  setAccent(e.target.value.toUpperCase());
                  setError(null);
                  setSuggestion(null);
                }}
                className="h-10 w-14 cursor-pointer rounded-[var(--radius-md)] border border-input bg-card"
              />
              <Input
                aria-label="Accent hex value"
                value={accent}
                spellCheck={false}
                onChange={(e) => setAccent(e.target.value.toUpperCase())}
                className="font-mono"
                aria-invalid={!!error}
              />
              <Button onClick={onSaveAccent} loading={savingAccent}>
                Save
              </Button>
            </div>
            {error ? (
              <div className="flex flex-col items-start gap-1">
                {/* role="alert" is assertive by default — no redundant aria-live. The
                    actionable suggestion is a sibling button, not nested in the alert. */}
                <p className="text-xs text-destructive" role="alert">
                  {error}
                </p>
                {suggestion ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-foreground underline underline-offset-2"
                    onClick={() => {
                      setAccent(suggestion);
                      setError(null);
                      setSuggestion(null);
                    }}
                  >
                    Use {suggestion}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Kept readable automatically — a too-light color is blocked with a darker
                suggestion.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Logo</CardTitle>
            <CardDescription>PNG, SVG, or JPG · 1MB max · transparent preferred.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Label htmlFor="logo">Logo file</Label>
            <input
              id="logo"
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="text-sm text-muted-foreground file:mr-3 file:rounded-[var(--radius-md)] file:border file:border-input file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
            <Button variant="outline" onClick={onUploadLogo} loading={uploading} className="self-start">
              Upload logo
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Live preview — a sample Client surface with the Tenant accent applied */}
      <Card style={vars.style as CSSProperties} data-surface="portal-preview">
        <CardHeader>
          <CardTitle className="text-xl">How your clients see it</CardTitle>
          <CardDescription>A preview of your branded Client Portal.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {logoUrl ? (
              // Decorative: the Tenant name is shown as adjacent text, so alt="" avoids a
              // duplicate screen-reader read (EXPERIENCE.md Accessibility Floor).
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-10 w-auto max-w-[160px] object-contain" />
            ) : (
              <span
                className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] font-display text-lg text-[var(--tenant-accent-foreground)]"
                style={{ background: "var(--tenant-accent)" }}
                aria-hidden
              >
                {vars.monogram}
              </span>
            )}
            <span className="font-display text-lg">{tenantName}</span>
          </div>
          <button
            type="button"
            className="self-start rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium text-[var(--tenant-accent-foreground)]"
            style={{ background: "var(--tenant-accent)" }}
          >
            View update
          </button>
          <p className="text-sm text-muted-foreground">
            New milestone shipped —{" "}
            <span className="font-medium" style={{ color: "var(--tenant-accent-text)" }}>
              read the details
            </span>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

/** After the GitHub App install, the Setup page binds the installation server-side and redirects
 * here with `?installed=1` (Story 3.2.1). This fires the success toast that the server redirect
 * can't, then drops the param so a refresh doesn't re-toast. */
export function InstallToast() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const fired = useRef(false);

  useEffect(() => {
    if (params.get("installed") === "1" && !fired.current) {
      fired.current = true;
      toast.success("GitHub connected — pick a repo to start.");
      router.replace(pathname); // strip the ?installed flag
    }
  }, [params, pathname, router]);

  return null;
}

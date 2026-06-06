"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signOut } from "@/server/auth/client";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    setLoading(true);
    try {
      const { error } = await signOut();
      if (error) {
        toast.error("Couldn't sign out. Please try again.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Couldn't sign out. Please try again.");
    } finally {
      // Always re-enable: on success the redirect unmounts this anyway; on failure the
      // user can retry instead of being stuck on "Signing out…".
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" loading={loading} onClick={onLogout}>
      Log out
    </Button>
  );
}

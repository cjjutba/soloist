import * as React from "react";

const MOBILE_BREAKPOINT = 768;

// Subscribe to the mobile media query. `useSyncExternalStore` reads the value without a
// setState-in-effect (which this repo's react-hooks lint rules forbid) and is SSR-safe.
function subscribe(callback: () => void): () => void {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT, // client snapshot
    () => false, // server snapshot — assume desktop during SSR
  );
}

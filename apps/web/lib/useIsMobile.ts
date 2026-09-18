"use client";

import { useEffect, useState } from "react";

// Matches the 1000px breakpoint RoomView.tsx already uses for its
// three-column desktop layout (Dice & Controls | Map | Chat) — the same
// "is this actually a phone/narrow screen" definition the rest of the app
// already established, not a new one.
const MOBILE_BREAKPOINT_QUERY = "(max-width: 999px)";

/** True below the app's existing desktop breakpoint. Starts as `false` (the
 * safe default for server-side rendering, where there's no real viewport to
 * check yet) and corrects itself right after mount, and again any time the
 * viewport crosses the breakpoint (e.g. rotating a phone, resizing a
 * desktop window). */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
    setIsMobile(mql.matches);
    function handleChange(e: MediaQueryListEvent) {
      setIsMobile(e.matches);
    }
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}

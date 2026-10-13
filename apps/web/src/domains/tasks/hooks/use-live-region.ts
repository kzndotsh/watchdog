import { createElement, useEffect, useRef, useState } from "react";

const LIVE_REGION_CLEAR_MS = 1500;

type LiveRegionTimers = {
  frame: number | null;
  timeout: number | null;
};

function cancelTimers(timers: LiveRegionTimers): void {
  if (timers.frame !== null) window.cancelAnimationFrame(timers.frame);
  if (timers.timeout !== null) window.clearTimeout(timers.timeout);
  timers.frame = null;
  timers.timeout = null;
}

export function useLiveRegion() {
  const [message, setMessage] = useState("");
  const timersRef = useRef<LiveRegionTimers>({ frame: null, timeout: null });

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      cancelTimers(timers);
    };
  }, []);

  const announce = (text: string) => {
    const timers = timersRef.current;
    cancelTimers(timers);
    setMessage("");
    timers.frame = window.requestAnimationFrame(() => {
      timers.frame = null;
      setMessage(text);
      timers.timeout = window.setTimeout(() => {
        timers.timeout = null;
        setMessage("");
      }, LIVE_REGION_CLEAR_MS);
    });
  };

  const liveRegion = createElement(
    "div",
    {
      "aria-atomic": "true",
      "aria-live": "polite",
      className: "sr-only",
    },
    message
  );

  return { announce, liveRegion };
}

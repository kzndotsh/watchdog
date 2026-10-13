import {
  createElement,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

const LIVE_REGION_CLEAR_MS = 1500;

function announceLiveRegion(
  text: string,
  setMessage: (message: string) => void,
  clearRef: RefObject<number | null>
): void {
  setMessage("");
  window.requestAnimationFrame(() => {
    setMessage(text);
    if (clearRef.current) window.clearTimeout(clearRef.current);
    clearRef.current = window.setTimeout(() => {
      setMessage("");
    }, LIVE_REGION_CLEAR_MS);
  });
}

export function useLiveRegion() {
  const [message, setMessage] = useState("");
  const clearRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const announce = (text: string) => {
    announceLiveRegion(
      text,
      (message) => {
        if (isMountedRef.current) setMessage(message);
      },
      clearRef
    );
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

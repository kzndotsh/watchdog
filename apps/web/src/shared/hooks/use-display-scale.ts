import { useEffect, useSyncExternalStore } from "react";

import { applyDisplayScale } from "@/shared/lib/display-scale";
import {
  getDisplayScale,
  getServerDisplayScale,
  persistDisplayScale,
  subscribeToDisplayScale,
} from "@/shared/lib/display-scale-store";

export function useDisplayScale() {
  const scale = useSyncExternalStore(
    subscribeToDisplayScale,
    getDisplayScale,
    getServerDisplayScale
  );

  useEffect(() => {
    applyDisplayScale(scale);
  }, [scale]);

  return { scale, setScale: persistDisplayScale };
}

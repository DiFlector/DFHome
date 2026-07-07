import * as React from "react";

import { api } from "@/lib/api";
import type { Widget } from "@/lib/types";

export function useWidgets() {
  const [widgets, setWidgets] = React.useState<Widget[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      setWidgets(await api.getWidgets());
    } catch {
      setWidgets([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { widgets, isLoading, refresh };
}

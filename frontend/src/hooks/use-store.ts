import * as React from "react";

import { api } from "@/lib/api";
import type { StoreItem } from "@/lib/types";

export function useStore() {
  const [items, setItems] = React.useState<StoreItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      setItems(await api.getStore());
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const install = React.useCallback(
    async (domain: string) => {
      await api.install(domain);
      await refresh();
    },
    [refresh],
  );

  const update = React.useCallback(
    async (domain: string) => {
      await api.update(domain);
      await refresh();
    },
    [refresh],
  );

  const uninstall = React.useCallback(
    async (domain: string) => {
      await api.uninstall(domain);
      await refresh();
    },
    [refresh],
  );

  return { items, isLoading, refresh, install, update, uninstall };
}

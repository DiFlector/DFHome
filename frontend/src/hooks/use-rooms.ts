import * as React from "react";

import { api } from "@/lib/api";
import type { Room } from "@/lib/types";

export function useRooms() {
  const [rooms, setRooms] = React.useState<Room[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      setRooms(await api.getRooms());
    } catch {
      setRooms([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rooms, isLoading, refresh };
}

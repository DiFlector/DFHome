import * as React from "react";

import { api } from "@/lib/api";
import type { PlanLayout } from "@/lib/types";

const EMPTY: PlanLayout = { rooms: [], devices: [] };

/**
 * План дома хранится в ядре (SQLite): GET возвращает сохранённый пользователем
 * layout, а при его отсутствии — suggested-раскладку от установленных интеграций.
 */
export function usePlanLayout() {
  const [layout, setLayout] = React.useState<PlanLayout>(EMPTY);
  const [isLoading, setIsLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      setLayout(await api.getPlan());
    } catch {
      setLayout(EMPTY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const save = React.useCallback(async () => {
    await api.savePlan(layout);
  }, [layout]);

  const reset = React.useCallback(async () => {
    try {
      setLayout(await api.resetPlan());
    } catch {
      await load();
    }
  }, [load]);

  return { layout, setLayout, save, reset, isLoading };
}

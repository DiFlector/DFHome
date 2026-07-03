import { useState } from "react";

/** Boolean UI preference persisted in localStorage — per browser/TV, which is
    exactly right for display toggles like night mode on the kiosk screen. */
export function useStoredFlag(key: string, initial: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : raw === "1";
    } catch {
      return initial;
    }
  });
  const update = (v: boolean) => {
    setValue(v);
    try {
      localStorage.setItem(key, v ? "1" : "0");
    } catch {
      // storage unavailable (private mode) — the toggle still works for the session
    }
  };
  return [value, update];
}

"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useCsRealtimePresence, type CsRealtimePresence } from "./useCsRealtimePresence";

interface ContextValue {
  viewers: CsRealtimePresence[];
}

const Ctx = createContext<ContextValue>({ viewers: [] });

export function CsRealtimePresenceProvider({ children }: { children: ReactNode }) {
  const { viewers } = useCsRealtimePresence();
  return <Ctx.Provider value={{ viewers }}>{children}</Ctx.Provider>;
}

export function useCsRealtimePresenceContext(): ContextValue {
  return useContext(Ctx);
}

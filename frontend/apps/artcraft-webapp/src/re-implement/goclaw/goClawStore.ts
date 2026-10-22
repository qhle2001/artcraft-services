import { create } from "zustand";
import { OmniGenApi, type ConfiguredGoClawAgentInfo } from "@storyteller/api";

export type GoClawMediaType = "image" | "video" | "audio";
export type ConfiguredGoClawAgent = ConfiguredGoClawAgentInfo;

interface GoClawState {
  agents: ConfiguredGoClawAgent[];
  loading: boolean;
  error: string | null;
  loadAgents: () => Promise<void>;
  reset: () => void;
}

let pendingLoad: Promise<void> | null = null;
let sessionVersion = 0;

// Discard configuration from older browser-managed versions of the integration.
if (typeof window !== "undefined") {
  try {
    localStorage.removeItem("artcraft.goclaw.integration.v1");
    localStorage.removeItem("artcraft.goclaw.url");
    sessionStorage.removeItem("artcraft.goclaw.api-token.v1");
  } catch { /* Storage may be disabled. Agent metadata is kept in memory only. */ }
}

export const useGoClawStore = create<GoClawState>((set) => ({
  agents: [],
  loading: false,
  error: null,
  loadAgents: () => {
    if (pendingLoad) return pendingLoad;
    const version = sessionVersion;
    set({ loading: true, error: null });
    const request: Promise<void> = new OmniGenApi().getConfiguredGoClawAgents()
      .then(({ agents }) => {
        if (version === sessionVersion) set({ agents, loading: false });
      })
      .catch((cause) => {
        if (version === sessionVersion) {
          set({
            agents: [],
            loading: false,
            error: cause instanceof Error ? cause.message : "Could not load GoClaw agents.",
          });
        }
      })
      .finally(() => {
        if (pendingLoad === request) pendingLoad = null;
      });
    pendingLoad = request;
    return request;
  },
  reset: () => {
    sessionVersion += 1;
    pendingLoad = null;
    set({ agents: [], loading: false, error: null });
  },
}));

export const goClawAction = (id: string) => `goclaw-agent:${id}`;

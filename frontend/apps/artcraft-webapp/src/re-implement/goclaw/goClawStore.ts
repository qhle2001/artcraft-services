import { create } from "zustand";
import type { GoClawAgentInfo } from "@storyteller/api";

export type GoClawMediaType = "image" | "video" | "audio";
export type ConfiguredGoClawAgent = GoClawAgentInfo & { type: GoClawMediaType };

const STORAGE_KEY = "artcraft.goclaw.integration.v1";
const TOKEN_KEY = "artcraft.goclaw.api-token.v1";
if (typeof window !== "undefined") sessionStorage.removeItem(TOKEN_KEY);

interface SavedConnection {
  url: string;
  agents: ConfiguredGoClawAgent[];
}

function loadConnection(): SavedConnection {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return {
      url: typeof value?.url === "string" ? value.url : localStorage.getItem("artcraft.goclaw.url") ?? "",
      agents: Array.isArray(value?.agents)
        ? value.agents.filter((agent: unknown): agent is ConfiguredGoClawAgent => {
            if (!agent || typeof agent !== "object") return false;
            const candidate = agent as ConfiguredGoClawAgent;
            return (
              typeof candidate.id === "string" &&
              typeof candidate.name === "string" &&
              ["image", "video", "audio"].includes(candidate.type)
            );
          })
        : [],
    };
  } catch {
    return { url: "", agents: [] };
  }
}

const initial = typeof window === "undefined" ? { url: "", agents: [] } : loadConnection();

interface GoClawState extends SavedConnection {
  connect: (url: string, agents: GoClawAgentInfo[]) => void;
  setUrl: (url: string) => void;
  addAgent: (id: string, name: string, type: GoClawMediaType) => void;
  removeAgent: (id: string) => void;
  setAgentType: (id: string, type: GoClawMediaType) => void;
  disconnect: () => void;
}

function save(url: string, agents: ConfiguredGoClawAgent[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ url, agents }));
}

export const useGoClawStore = create<GoClawState>((set) => ({
  ...initial,
  connect: (url, agents) => set((state) => {
    const configured = agents.map((agent) => ({
      ...agent,
      type: state.agents.find((saved) => saved.id === agent.id && state.url === url)?.type ?? "image" as GoClawMediaType,
    }));
    save(url, configured);
    if (typeof window !== "undefined") sessionStorage.removeItem(TOKEN_KEY);
    return { url, agents: configured };
  }),
  setUrl: (url) => set((state) => {
    save(url, state.agents);
    return { url };
  }),
  addAgent: (id, name, type) => set((state) => {
    if (!id.trim() || !name.trim()) return state;
    const agents = [
      ...state.agents.filter((agent) => agent.id !== id.trim()),
      { id: id.trim(), name: name.trim(), description: "Manually added agent", type },
    ];
    save(state.url, agents);
    return { agents };
  }),
  removeAgent: (id) => set((state) => {
    const agents = state.agents.filter((agent) => agent.id !== id);
    save(state.url, agents);
    return { agents };
  }),
  setAgentType: (id, type) => set((state) => {
    const agents = state.agents.map((agent) => agent.id === id ? { ...agent, type } : agent);
    save(state.url, agents);
    return { agents };
  }),
  disconnect: () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("artcraft.goclaw.url");
    sessionStorage.removeItem(TOKEN_KEY);
    set({ url: "", agents: [] });
  },
}));

export const goClawAction = (id: string) => `goclaw-agent:${id}`;

import { create } from "zustand";
import type { GoClawAgentInfo } from "@storyteller/api";

export type GoClawMediaType = "image" | "video" | "audio";
export type ConfiguredGoClawAgent = GoClawAgentInfo & { type: GoClawMediaType };

const STORAGE_KEY = "artcraft.goclaw.integration.v1";
const TOKEN_KEY = "artcraft.goclaw.api-token.v1";

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
        ? value.agents.filter((agent: ConfiguredGoClawAgent) =>
            typeof agent.id === "string" && typeof agent.name === "string" &&
            ["image", "video", "audio"].includes(agent.type))
        : [],
    };
  } catch {
    return { url: "", agents: [] };
  }
}

const initial = typeof window === "undefined" ? { url: "", agents: [] } : loadConnection();

interface GoClawState extends SavedConnection {
  token: string;
  connect: (url: string, token: string, agents: GoClawAgentInfo[]) => void;
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
  token: typeof window === "undefined" ? "" : sessionStorage.getItem(TOKEN_KEY) ?? "",
  connect: (url, token, agents) => set((state) => {
    const configured = agents.map((agent) => ({
      ...agent,
      type: state.agents.find((saved) => saved.id === agent.id && state.url === url)?.type ?? "image" as GoClawMediaType,
    }));
    save(url, configured);
    sessionStorage.setItem(TOKEN_KEY, token);
    return { url, token, agents: configured };
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
    set({ url: "", token: "", agents: [] });
  },
}));

export const goClawAction = (id: string) => `goclaw-agent:${id}`;

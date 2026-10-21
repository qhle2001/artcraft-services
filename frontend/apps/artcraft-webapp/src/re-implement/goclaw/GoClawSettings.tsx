import { useState } from "react";
import { OmniGenApi } from "@storyteller/api";
import { useGoClawStore, type GoClawMediaType } from "./goClawStore";

const TYPES: GoClawMediaType[] = ["image", "video", "audio"];

export function GoClawSettings() {
  const url = useGoClawStore((state) => state.url);
  const token = useGoClawStore((state) => state.token);
  const agents = useGoClawStore((state) => state.agents);
  const connect = useGoClawStore((state) => state.connect);
  const addAgent = useGoClawStore((state) => state.addAgent);
  const removeAgent = useGoClawStore((state) => state.removeAgent);
  const setAgentType = useGoClawStore((state) => state.setAgentType);
  const disconnect = useGoClawStore((state) => state.disconnect);
  const [draftUrl, setDraftUrl] = useState(url);
  const [draftToken, setDraftToken] = useState(token);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [manualId, setManualId] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualType, setManualType] = useState<GoClawMediaType>("image");

  const loadAgents = async () => {
    setLoading(true);
    setError("");
    try {
      const normalizedUrl = draftUrl.trim().replace(/\/+$/, "");
      const response = await new OmniGenApi().connectGoClaw({
        goclaw_url: normalizedUrl,
        goclaw_api_token: draftToken.trim(),
      });
      connect(normalizedUrl, draftToken.trim(), response.agents);
      if (!response.agents.length) setError("Connected, but no agents were returned.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load GoClaw agents.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 text-white">
      <div>
        <h3 className="font-semibold">Self-hosted GoClaw</h3>
        <p className="mt-1 text-xs text-white/60">Connect once, assign a media type to each agent, and select it from the Image, Video, or Audio model list.</p>
      </div>
      <label className="block space-y-1 text-xs">
        <span>GoClaw public URL</span>
        <input className="w-full rounded border border-white/20 bg-black/30 p-2 text-sm" type="url" placeholder="https://goclaw.example.com" value={draftUrl} onChange={(event) => setDraftUrl(event.target.value)} />
      </label>
      <label className="block space-y-1 text-xs">
        <span>GoClaw API token</span>
        <input className="w-full rounded border border-white/20 bg-black/30 p-2 text-sm" type="password" autoComplete="off" placeholder="Bearer token" value={draftToken} onChange={(event) => setDraftToken(event.target.value)} />
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={loading || !draftUrl.trim() || !draftToken.trim()} onClick={loadAgents} className="rounded bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-50">
          {loading ? "Loading…" : agents.length ? "Refresh agents" : "Connect and load agents"}
        </button>
        {(url || agents.length > 0) && <button type="button" onClick={() => { disconnect(); setDraftToken(""); }} className="rounded border border-white/20 px-3 py-2 text-xs">Clear connection</button>}
      </div>
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      {url && <p className="text-xs text-white/60">Connected to {url}. The token stays in this browser session; the agent list and types are saved on this device.</p>}
      <div className="space-y-2 border-t border-white/10 pt-4">
        <h4 className="text-sm font-medium">Add an agent by ID</h4>
        <p className="text-xs text-white/60">You can preview the model lists before the ArtCraft API is deployed. Verify the ID against GoClaw before generating.</p>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Agent ID" className="min-w-0 flex-1 rounded border border-white/20 bg-black/30 p-2 text-xs" placeholder="Agent ID" value={manualId} onChange={(event) => setManualId(event.target.value)} />
          <input aria-label="Agent name" className="min-w-0 flex-1 rounded border border-white/20 bg-black/30 p-2 text-xs" placeholder="Display name" value={manualName} onChange={(event) => setManualName(event.target.value)} />
          <select aria-label="Agent media type" className="rounded border border-white/20 bg-[#17171b] p-2 text-xs" value={manualType} onChange={(event) => setManualType(event.target.value as GoClawMediaType)}>
            {TYPES.map((type) => <option value={type} key={type}>{type}</option>)}
          </select>
          <button type="button" disabled={!manualId.trim() || !manualName.trim()} className="rounded border border-white/30 px-3 py-2 text-xs disabled:opacity-50" onClick={() => {
            addAgent(manualId, manualName, manualType);
            setManualId("");
            setManualName("");
          }}>Add</button>
        </div>
      </div>
      {agents.length > 0 && (
        <div className="space-y-2 border-t border-white/10 pt-4">
          <h4 className="text-sm font-medium">Agents ({agents.length})</h4>
          {agents.map((agent) => (
            <div key={agent.id} className="flex items-center justify-between gap-3 rounded border border-white/10 p-2">
              <div className="min-w-0">
                <div className="truncate text-sm">{agent.name}</div>
                <div className="truncate text-xs text-white/50">{agent.description || agent.id}</div>
              </div>
              <label className="shrink-0 text-xs">
                <span className="sr-only">Media type for {agent.name}</span>
                <select className="rounded border border-white/20 bg-[#17171b] p-2 capitalize" value={agent.type} onChange={(event) => setAgentType(agent.id, event.target.value as GoClawMediaType)}>
                  {TYPES.map((type) => <option value={type} key={type}>{type}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => removeAgent(agent.id)} className="shrink-0 text-xs text-white/60 hover:text-white" aria-label={`Remove ${agent.name}`}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

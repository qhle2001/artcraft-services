import { useEffect, useState } from "react";
import { OmniGenApi } from "@storyteller/api";
import { useGoClawStore, type GoClawMediaType } from "./goClawStore";

const TYPES: GoClawMediaType[] = ["image", "video", "audio"];

export function GoClawSettings() {
  const url = useGoClawStore((state) => state.url);
  const agents = useGoClawStore((state) => state.agents);
  const connect = useGoClawStore((state) => state.connect);
  const setUrl = useGoClawStore((state) => state.setUrl);
  const addAgent = useGoClawStore((state) => state.addAgent);
  const removeAgent = useGoClawStore((state) => state.removeAgent);
  const setAgentType = useGoClawStore((state) => state.setAgentType);
  const disconnect = useGoClawStore((state) => state.disconnect);
  const [draftUrl, setDraftUrl] = useState(url);
  const [draftToken, setDraftToken] = useState("");
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [manualId, setManualId] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualType, setManualType] = useState<GoClawMediaType>("image");

  useEffect(() => {
    const api = new OmniGenApi();
    api.getGoClawSettings().then(async (settings) => {
      setConfigured(settings.configured);
      if (settings.goclaw_url) {
        setDraftUrl(settings.goclaw_url);
        setUrl(settings.goclaw_url);
        const response = await api.connectGoClaw();
        connect(settings.goclaw_url, response.agents);
      } else {
        setDraftUrl("");
        disconnect();
      }
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load GoClaw settings."));
  }, [connect, disconnect, setUrl]);

  const loadAgents = async () => {
    setLoading(true);
    setError("");
    try {
      const normalizedUrl = draftUrl.trim().replace(/\/+$/, "");
      const api = new OmniGenApi();
      if (draftToken.trim()) {
        await api.saveGoClawSettings({
          goclaw_url: normalizedUrl,
          goclaw_api_token: draftToken.trim(),
        });
        setConfigured(true);
        setDraftToken("");
      } else if (normalizedUrl !== url) {
        throw new Error("Enter a new API token to change the saved GoClaw URL.");
      }
      const response = await api.connectGoClaw();
      connect(normalizedUrl, response.agents);
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
        <p className="text-xs text-white/60">GoClaw generation does not use ArtCraft AI credits. Usage limits and provider costs are managed by your GoClaw deployment.</p>
        <p className="mt-1 text-xs text-white/60">An administrator configures the instance connection once. The backend stores the encrypted token; this browser never reads it back.</p>
      </div>
      <label className="block space-y-1 text-xs">
        <span>GoClaw public URL</span>
        <input className="w-full rounded border border-white/20 bg-black/30 p-2 text-sm" type="url" placeholder="https://goclaw.example.com" value={draftUrl} onChange={(event) => setDraftUrl(event.target.value)} />
      </label>
      <label className="block space-y-1 text-xs">
        <span>GoClaw API token {configured && "(leave blank to keep the saved token)"}</span>
        <input className="w-full rounded border border-white/20 bg-black/30 p-2 text-sm" type="password" autoComplete="new-password" placeholder={configured ? "Enter a new token to rotate it" : "Bearer token"} value={draftToken} onChange={(event) => setDraftToken(event.target.value)} />
      </label>
      <div className="flex gap-2">
        <button type="button" disabled={loading || !draftUrl.trim() || (!draftToken.trim() && !configured)} onClick={loadAgents} className="rounded bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-50">
          {loading ? "Loading…" : draftToken.trim() ? "Save and test connection" : agents.length ? "Refresh agents" : "Test connection"}
        </button>
        {(url || agents.length > 0 || configured) && <button type="button" onClick={async () => {
          setLoading(true);
          try { await new OmniGenApi().clearGoClawSettings(); disconnect(); setConfigured(false); setDraftUrl(""); setDraftToken(""); }
          catch (cause) { setError(cause instanceof Error ? cause.message : "Could not clear GoClaw settings."); }
          finally { setLoading(false); }
        }} className="rounded border border-white/20 px-3 py-2 text-xs">Clear connection</button>}
      </div>
      {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
      {url && <p className="text-xs text-white/60">Connected to {url}. The backend stores the encrypted token; this browser stores agent selections only.</p>}
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

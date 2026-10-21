import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Cable, X } from "lucide-react";
import { OmniGenApi } from "@storyteller/api";
import type { GoClawAgentInfo } from "@storyteller/api";

interface GoClawConnectionDialogProps {
  url: string;
  apiToken: string;
  agents: GoClawAgentInfo[];
  onConnected: (url: string, apiToken: string, agents: GoClawAgentInfo[]) => void;
  onDisconnected: () => void;
}

export function GoClawConnectionDialog({
  url,
  apiToken,
  agents,
  onConnected,
  onDisconnected,
}: GoClawConnectionDialogProps) {
  const [open, setOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState(url);
  const [draftToken, setDraftToken] = useState(apiToken);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraftUrl(url);
      setDraftToken(apiToken);
      setError(null);
    }
  }, [open, url, apiToken]);

  const connect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await new OmniGenApi().connectGoClaw({
        goclaw_url: draftUrl.trim(),
        goclaw_api_token: draftToken.trim(),
      });
      onConnected(draftUrl.trim(), draftToken.trim(), response.agents);
      if (response.agents.length) {
        setOpen(false);
      } else {
        setError("Connected, but this GoClaw account has no agents available.");
      }
    } catch (err) {
      const apiError = (typeof err === "object" && err !== null ? err : {}) as {
        serverMessage?: unknown;
        message?: unknown;
      };
      setError(typeof apiError.serverMessage === "string"
        ? apiError.serverMessage
        : err instanceof Error
          ? err.message
          : typeof apiError.message === "string"
            ? apiError.message
            : "Could not connect to GoClaw.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        title="Connect GoClaw"
        aria-label="Connect GoClaw"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <Cable className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="goclaw-dialog-title"
            className="w-full max-w-lg rounded-xl border border-border bg-background p-5 text-foreground shadow-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="goclaw-dialog-title" className="text-lg font-semibold">
                  Connect your GoClaw
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Enter your self-hosted GoClaw URL to load agents you can use for image generation.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={connect} className="space-y-4">
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">GoClaw public URL</span>
                <input
                  type="url"
                  required
                  value={draftUrl}
                  onChange={(event) => setDraftUrl(event.target.value)}
                  placeholder="https://goclaw.example.com"
                  autoComplete="url"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-primary"
                />
              </label>
              <label className="block space-y-1.5 text-sm">
                <span className="font-medium">GoClaw API token</span>
                <input
                  type="password"
                  required
                  value={draftToken}
                  onChange={(event) => setDraftToken(event.target.value)}
                  placeholder="Bearer token"
                  autoComplete="off"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:border-primary"
                />
              </label>
              <p className="text-xs text-muted-foreground">
                The URL is remembered in this browser. The token stays in page memory and is sent to ArtCraft only when connecting or generating.
              </p>
              {url && agents.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Connected to <span className="font-medium text-foreground">{url}</span> · {agents.length} {agents.length === 1 ? "agent" : "agents"} loaded
                </p>
              )}
              {error && (
                <p role="status" className="text-sm text-destructive">{error}</p>
              )}
              <div className="flex justify-between gap-3 pt-1">
                {url && (
                  <button
                    type="button"
                    onClick={() => {
                      onDisconnected();
                      setDraftUrl("");
                      setDraftToken("");
                      setError(null);
                    }}
                    className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
                  >
                    Disconnect
                  </button>
                )}
                <button
                  type="submit"
                  disabled={loading || !draftUrl.trim() || !draftToken.trim()}
                  className="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Connecting…" : "Connect and load agents"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

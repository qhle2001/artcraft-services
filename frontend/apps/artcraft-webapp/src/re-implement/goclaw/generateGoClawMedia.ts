import { MediaFilesApi, OmniGenApi } from "@storyteller/api";
import { useGoClawStore, type GoClawMediaType } from "./goClawStore";

export async function generateGoClawMedia(args: {
  type: GoClawMediaType;
  agentId: string;
  prompt: string;
  referenceMediaTokens?: string[];
}) {
  // Read the current credentials at submission time. A stale selection must
  // never send a request to a previously configured GoClaw instance.
  const { url, token, agents } = useGoClawStore.getState();
  if (!url || !token || !agents.some((agent) => agent.id === args.agentId && agent.type === args.type)) {
    throw new Error("Configure this GoClaw agent in Settings before generating.");
  }
  const response = await new OmniGenApi().generateImageWithGoClaw({
    goclaw_url: url,
    goclaw_api_token: token,
    agent_id: args.agentId,
    media_type: args.type,
    idempotency_token: crypto.randomUUID(),
    prompt: args.prompt,
    reference_media_tokens: args.referenceMediaTokens,
  });
  const api = new MediaFilesApi();
  const media = await Promise.all(response.media_tokens.map((mediaFileToken) =>
    api.GetMediaFileByToken({ mediaFileToken }),
  ));
  return media.filter((item) => item.success && item.data?.media_links?.cdn_url).map((item) => ({
    media_token: item.data!.token,
    cdn_url: item.data!.media_links!.cdn_url!,
    maybe_thumbnail_template: item.data!.media_links!.thumbnail_template,
  }));
}

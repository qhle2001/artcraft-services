import { MediaFilesApi, OmniGenApi } from "@storyteller/api";
import { useGoClawStore, type GoClawMediaType } from "./goClawStore";

export async function generateGoClawMedia(args: {
  type: GoClawMediaType;
  agentId: string;
  prompt: string;
  referenceMediaTokens?: string[];
}) {
  const referenceMediaTokens = args.referenceMediaTokens ?? [];
  if (referenceMediaTokens.length > 10) {
    throw new Error("GoClaw accepts up to 10 reference files per request.");
  }

  const { agents } = useGoClawStore.getState();
  if (!agents.some((agent) => agent.id === args.agentId && agent.type === args.type)) {
    throw new Error("Configure this GoClaw connection and agent in Settings before generating.");
  }
  const response = await new OmniGenApi().generateImageWithGoClaw({
    agent_id: args.agentId,
    media_type: args.type,
    idempotency_token: crypto.randomUUID(),
    prompt: args.prompt,
    reference_media_tokens: referenceMediaTokens,
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

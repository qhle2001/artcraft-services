import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilterMediaClasses } from "@storyteller/api";
import type { OmniGenImageModelInfo } from "@storyteller/api";
import {
  PopoverMenu,
  type PopoverItem,
  groupModelItems,
  useModelPickerStyleStore,
} from "@storyteller/ui-popover";
import { Tooltip } from "@storyteller/ui-tooltip";
import { Button } from "@storyteller/ui-button";
import { GalleryModal, type GalleryItem } from "@storyteller/ui-gallery-modal";
import {
  PromptBox,
  ImagePromptRow,
  MobilePromptForm,
  MobileSelectField,
  MobileFieldButton,
  SettingsDrawer,
  DrawerOptionList,
  DrawerSection,
  type RefImage,
} from "../../components/prompt-box";
import {
  GenerationGallery,
  useGalleryData,
  useGenerationJobs,
  useAuthCheck,
  usePromptHeight,
  useLightboxNav,
  CreateMediaPageShell,
} from "../../components/generation-gallery";
import { Lightbox } from "../../components/lightbox/lightbox";
import { useCreateImageStore } from "./create-image-store";
import { enqueueImageGeneration, startPolling } from "./generate-image-api";
import {
  AspectRatioPicker,
  buildAspectRatioItems,
  aspectRatioFromLabel,
} from "./components/AspectRatioPicker";
import { useGoClawAgents } from "../../re-implement/goclaw/useGoClawAgents";
import {
  ResolutionPicker,
  buildResolutionItems,
  resolutionFromLabel,
} from "./components/ResolutionPicker";
import {
  QualityPicker,
  buildQualityItems,
  qualityFromLabel,
} from "./components/QualityPicker";
import {
  galleryItemToRefImage,
  mergeRefImages,
  toastMergeRefImagesOutcome,
} from "../../lib/send-to-prompt";
import { resolveModelOption } from "../../lib/resolve-model-setting";
import {
  useOmniGenImageModels,
  OMNI_GENERATE_OUTAGE_MESSAGE,
} from "@storyteller/omni-gen";
import { toast } from "../../components/toast/toast";
import { useSignupCta } from "../../components/signup-cta-modal";
import { SparklesIcon } from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────

const DEFAULT_MODEL_ID = "nano_banana_2";

const IMAGE_FILTER = [FilterMediaClasses.IMAGE];

// ── Component ────────────────────────────────────────────────────────────

export default function CreateImage() {
  const { user, authChecked } = useAuthCheck();
  const { loggedIn, openSignupCta } = useSignupCta();
  const { promptBoxRef, promptHeight } = usePromptHeight();

  // Fetch models from API
  const { models: apiModels } = useOmniGenImageModels();
  const { agents: configuredGoClawAgents } = useGoClawAgents();
  const goClawAgents = useMemo(() => configuredGoClawAgents.filter((agent) => agent.type === "image"), [configuredGoClawAgents]);
  const [selectedGoClawAgentId, setSelectedGoClawAgentId] = useState<string | null>(null);

  // UI state
  const ui = useCreateImageStore((s) => s.ui);
  const setUi = useCreateImageStore((s) => s.setUi);

  const selectedModel = useMemo((): OmniGenImageModelInfo | undefined => {
    if (!apiModels.length) return undefined;
    if (ui.selectedModelId) {
      return (
        apiModels.find((m) => m.model === ui.selectedModelId) ??
        apiModels.find((m) => m.model === DEFAULT_MODEL_ID) ??
        apiModels[0]
      );
    }
    return apiModels.find((m) => m.model === DEFAULT_MODEL_ID) ?? apiModels[0];
  }, [apiModels, ui.selectedModelId]);

  const selectedGoClawAgent =
    goClawAgents.find((agent) => agent.id === selectedGoClawAgentId) ??
    goClawAgents[0];

  // Soft prompt limit from the API; undefined (no model / unset) = unlimited.
  const maxPromptLength = selectedGoClawAgent
    ? undefined
    : selectedModel?.text_prompt_max_length ?? undefined;

  const prompt = ui.prompt;
  const setPrompt = useCallback((v: string) => setUi({ prompt: v }), [setUi]);

  // Settings are sticky across model switches: the store holds the user's
  // chosen value (set by the setters below) untouched, and we resolve an
  // *effective* value against the current model here — keeping the choice when
  // supported, otherwise falling back to the model's default for display +
  // generation only. See lib/resolve-model-setting.
  const aspectRatio =
    resolveModelOption(
      ui.aspectRatio,
      selectedModel?.aspect_ratio_options,
      selectedModel?.aspect_ratio_default,
    ) ?? ui.aspectRatio;
  const setAspectRatio = useCallback(
    (v: string) => setUi({ aspectRatio: v }),
    [setUi],
  );
  const resolution = resolveModelOption(
    ui.resolution,
    selectedModel?.resolution_options,
    selectedModel?.resolution_default,
  );
  const setResolution = useCallback(
    (v: string | undefined) => setUi({ resolution: v }),
    [setUi],
  );
  const quality = resolveModelOption(
    ui.quality,
    selectedModel?.quality_options,
    selectedModel?.default_quality,
  );
  const setQuality = useCallback(
    (v: string | undefined) => setUi({ quality: v }),
    [setUi],
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const referenceImages = useCreateImageStore((s) => s.referenceImages);
  const setReferenceImages = useCreateImageStore((s) => s.setReferenceImages);
  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false);
  const [isOutputDrawerOpen, setIsOutputDrawerOpen] = useState(false);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);
  const maxImageRefs = selectedGoClawAgent ? 6 : selectedModel?.image_refs_max ?? 6;
  const imagePickerMax = Math.max(1, maxImageRefs - referenceImages.length);

  useEffect(() => {
    if (isImagePickerOpen) setPickerSelectedIds([]);
  }, [isImagePickerOpen]);

  const handlePickerSelect = useCallback(
    (id: string) => {
      setPickerSelectedIds((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        if (prev.length >= imagePickerMax) {
          return imagePickerMax === 1 ? [id] : prev;
        }
        return [...prev, id];
      });
    },
    [imagePickerMax],
  );

  // Batch store (enqueue flow only)
  const startBatch = useCreateImageStore((s) => s.startBatch);
  const setBatchJobToken = useCreateImageStore((s) => s.setBatchJobToken);
  const completeBatch = useCreateImageStore((s) => s.completeBatch);
  const failBatch = useCreateImageStore((s) => s.failBatch);
  const dismissBatch = useCreateImageStore((s) => s.dismissBatch);
  const pollingCleanupsRef = useRef<Map<string, () => void>>(new Map());

  // Jobs + gallery
  const jobs = useGenerationJobs({ mediaType: "image", enabled: !!user });
  const gallery = useGalleryData({
    username: user?.username ?? null,
    filterMediaClasses: IMAGE_FILTER,
    excludeUploads: true,
  });

  // Map job token → batch count so the pending card/row can show
  // "Generating N images" — the batch runs as a single job chip.
  const batches = useCreateImageStore((s) => s.batches);
  const jobTokenToBatchCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const batch of batches) {
      if (batch.jobToken && batch.requestedCount > 1) {
        map.set(batch.jobToken, batch.requestedCount);
      }
    }
    return map;
  }, [batches]);

  const enrichedInProgress = useMemo(
    () =>
      jobs.inProgress.map((job) => {
        const batchCount = jobTokenToBatchCount.get(job.id);
        return batchCount ? { ...job, batchCount } : job;
      }),
    [jobs.inProgress, jobTokenToBatchCount],
  );

  const newlyCompletedTokens = useMemo(
    () => new Set(jobs.newlyCompleted.map((i) => i.id)),
    [jobs.newlyCompleted],
  );

  // Lightbox
  const flatItems = useMemo(() => {
    const filtered = gallery.items.filter(
      (i) => !newlyCompletedTokens.has(i.id),
    );
    return [...jobs.newlyCompleted, ...filtered];
  }, [jobs.newlyCompleted, gallery.items, newlyCompletedTokens]);

  const lightbox = useLightboxNav(flatItems);

  // Derived
  const hasAspectRatios = false;
  const hasResolutions = false;
  const hasQualityOptions = false;

  const estimatedCredits = null;

  const modelItems = useMemo(
    () =>
      goClawAgents.map((agent): PopoverItem => ({
        label: agent.name,
        description: agent.description || "GoClaw generation agent",
        selected: agent.id === selectedGoClawAgent?.id,
        action: `goclaw-agent:${agent.id}`,
      })),
    [goClawAgents, selectedGoClawAgent?.id],
  );
  // Family-grouped variant for the desktop picker. The mobile bottom sheet
  // keeps the flat `modelItems` (no flyouts on touch).
  const modelPickerStyle = useModelPickerStyleStore((s) => s.style);
  const groupedModelItems = useMemo(
    () =>
      modelPickerStyle === "grouped"
        ? groupModelItems(modelItems, () => "GoClaw Agents")
        : modelItems,
    [modelItems, modelPickerStyle],
  );

  const hasContent =
    jobs.inProgress.length > 0 ||
    jobs.failed.length > 0 ||
    jobs.newlyCompleted.length > 0 ||
    gallery.items.length > 0 ||
    gallery.isInitialLoading;

  // ── Effects ──────────────────────────────────────────────────────────────

  // Consume a pending recreate payload (set by the lightbox Recreate button)
  // and populate the promptbox fields. Does NOT trigger generation. Subscribes
  // to the store so it fires even when the user is already on this route.
  // Warn when a recreated generation's model is missing from the current
  // model list: selectedModel silently falls back to the default model, and
  // the restored prompt/settings may not be valid for it. Verified in its own
  // effect because the model list may still be loading when the recreate
  // payload is consumed.
  const [recreateModelIdToVerify, setRecreateModelIdToVerify] = useState<
    string | null
  >(null);
  useEffect(() => {
    if (!recreateModelIdToVerify || apiModels.length === 0) return;
    if (!apiModels.some((m) => m.model === recreateModelIdToVerify)) {
      toast.error(
        "The model used for this generation isn't available anymore. Using the default model instead.",
      );
    }
    setRecreateModelIdToVerify(null);
  }, [recreateModelIdToVerify, apiModels]);

  const pendingRecreate = useCreateImageStore((s) => s.pendingRecreate);
  useEffect(() => {
    if (!pendingRecreate) return;
    const payload = useCreateImageStore.getState().consumePendingRecreate();
    if (!payload) return;
    setReferenceImages(payload.referenceImages);
    setUi({
      prompt: payload.prompt,
      ...(payload.aspectRatio ? { aspectRatio: payload.aspectRatio } : {}),
      ...(payload.resolution ? { resolution: payload.resolution } : {}),
      ...(payload.modelId ? { selectedModelId: payload.modelId } : {}),
    });
    if (payload.modelId) setRecreateModelIdToVerify(payload.modelId);
  }, [pendingRecreate, setUi]);

  // Consume reference images sent from the library ("Send to prompt").
  // Waits for the model list so the merge applies the real per-model cap —
  // the sender doesn't know which model is selected here.
  const pendingRefImages = useCreateImageStore((s) => s.pendingRefImages);
  useEffect(() => {
    if (!pendingRefImages || apiModels.length === 0) return;
    const incoming = useCreateImageStore.getState().consumePendingRefImages();
    if (!incoming || incoming.length === 0) return;
    const result = mergeRefImages(referenceImages, incoming, maxImageRefs);
    if (result.added > 0) setReferenceImages(result.next);
    toastMergeRefImagesOutcome(result, maxImageRefs);
  }, [
    pendingRefImages,
    apiModels,
    referenceImages,
    maxImageRefs,
    setReferenceImages,
  ]);

  // Resume polling for pending batches
  useEffect(() => {
    const cleanups = pollingCleanupsRef.current;
    const pendingBatches = useCreateImageStore
      .getState()
      .batches.filter((b) => b.status === "pending" && b.jobToken);

    for (const batch of pendingBatches) {
      if (cleanups.has(batch.id)) continue;
      const stop = startPolling(
        batch.jobToken!,
        (images) => {
          completeBatch(batch.id, images);
          cleanups.delete(batch.id);
          window.dispatchEvent(new Event("task-queue-update"));
        },
        (reason) => {
          failBatch(batch.id, reason);
          cleanups.delete(batch.id);
          window.dispatchEvent(new Event("task-queue-update"));
        },
      );
      cleanups.set(batch.id, stop);
    }

    return () => {
      cleanups.forEach((stop) => stop());
      cleanups.clear();
    };
  }, [completeBatch, failBatch]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleModelChange = useCallback(
    (item: PopoverItem) => {
      if (item.action?.startsWith("goclaw-agent:")) {
        setSelectedGoClawAgentId(item.action.slice("goclaw-agent:".length));
        return;
      }
    },
    [],
  );

  const handleLibraryImageSelect = useCallback(
    (items: GalleryItem[]) => {
      const availableSlots = Math.max(0, maxImageRefs - referenceImages.length);
      const newImages: RefImage[] = items
        .slice(0, availableSlots)
        .map(galleryItemToRefImage);
      setReferenceImages([...referenceImages, ...newImages]);
      setIsImagePickerOpen(false);
    },
    [maxImageRefs, referenceImages, setReferenceImages],
  );

  // Refs already in the deck, greyed out in the picker so the same media file
  // can't be added twice to the reference list.
  const usedImageTokens = useMemo(
    () =>
      referenceImages
        .map((img) => img.mediaToken)
        .filter((t): t is string => !!t),
    [referenceImages],
  );

  const handleGenerate = useCallback(async () => {
    if (!loggedIn) {
      openSignupCta();
      return;
    }
    if (!prompt.trim() || isGenerating) return;
    if (!selectedGoClawAgent) {
      toast.error("No GoClaw image agent is available. Contact the server administrator.");
      return;
    }

    if (maxPromptLength !== undefined && prompt.length > maxPromptLength) {
      toast.error(
        `Prompt exceeds the ${maxPromptLength} character limit for this model`,
      );
      return;
    }

    setIsGenerating(true);
    const batchId = startBatch(
      prompt,
      1,
      selectedGoClawAgent.name,
    );

    try {
      const imageMediaTokens = selectedGoClawAgent || selectedModel?.image_refs_supported
        ? referenceImages
            .map((img) => img.mediaToken)
            .filter((t): t is string => typeof t === "string" && t.length > 0)
        : undefined;

      const result = await enqueueImageGeneration({
        prompt: prompt.trim(),
        imageMediaTokens: imageMediaTokens?.length
          ? imageMediaTokens
          : undefined,
        agentId: selectedGoClawAgent.id,
      });

      if (!result.success || (!result.jobToken && !result.images)) {
        // A GoClaw failure is not an ArtCraft credit or subscription event.
        // Show the backend error and mark the pending item as failed.
        if (result.errorCode != null && result.errorCode >= 500) {
          toast.error(OMNI_GENERATE_OUTAGE_MESSAGE);
        } else {
          toast.error(result.error ?? "GoClaw generation failed");
        }
        failBatch(batchId, result.error ?? "GoClaw generation failed");
        setIsGenerating(false);
        return;
      }

      if (result.images) {
        completeBatch(batchId, result.images);
        window.dispatchEvent(new Event("task-queue-update"));
        return;
      }

      const jobToken = result.jobToken;
      if (!jobToken) {
        toast.error("Generation response did not include a job token");
        failBatch(batchId, "Generation response did not include a job token");
        return;
      }

      setBatchJobToken(batchId, jobToken);
      window.dispatchEvent(new Event("credits-change"));
      window.dispatchEvent(new Event("task-queue-update"));

      const stopPolling = startPolling(
        jobToken,
        (images) => {
          completeBatch(batchId, images);
          pollingCleanupsRef.current.delete(batchId);
          window.dispatchEvent(new Event("task-queue-update"));
        },
        (reason) => {
          failBatch(batchId, reason);
          pollingCleanupsRef.current.delete(batchId);
          window.dispatchEvent(new Event("task-queue-update"));
        },
      );
      pollingCleanupsRef.current.set(batchId, stopPolling);
    } catch {
      toast.error("Network error - please try again");
      failBatch(batchId, "Network error - please try again");
    } finally {
      setIsGenerating(false);
    }
  }, [
    loggedIn,
    openSignupCta,
    prompt,
    isGenerating,
    selectedModel,
    selectedGoClawAgent,
    maxPromptLength,
    aspectRatio,
    resolution,
    hasResolutions,
    quality,
    hasQualityOptions,
    referenceImages,
    startBatch,
    setBatchJobToken,
    completeBatch,
    failBatch,
    dismissBatch,
  ]);

  // ── Mobile form ───────────────────────────────────────────────────────

  const supportsImagePrompts = !!selectedGoClawAgent || !!selectedModel?.image_refs_supported;

  const resolutionItems = buildResolutionItems(
    selectedModel?.resolution_options ?? [],
    resolution ?? selectedModel?.resolution_default ?? undefined,
  );
  const qualityItems = buildQualityItems(
    selectedModel?.quality_options ?? [],
    quality ?? selectedModel?.default_quality ?? undefined,
  );
  const outputSummary =
    [
      resolutionItems.find((i) => i.selected)?.label,
      qualityItems.find((i) => i.selected)?.label,
    ]
      .filter(Boolean)
      .join(" · ") || "Default";

  const mobileForm = (
    <MobilePromptForm
      prompt={prompt}
      onPromptChange={setPrompt}
      onSubmit={handleGenerate}
      isSubmitting={isGenerating}
      credits={estimatedCredits}
      placeholder={
        goClawAgents.length
          ? "Describe what you want in the image..."
          : "No image agent is available..."
      }
      autoAdvance={loggedIn && !!prompt.trim() && !isGenerating}
      modelField={
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <MobileSelectField
              label="Model"
              title="Select Model"
              items={modelItems}
              onSelect={handleModelChange}
            />
          </div>
        </div>
      }
      frames={
        supportsImagePrompts ? (
          <ImagePromptRow
            maxImagePromptCount={maxImageRefs}
            referenceImages={referenceImages}
            setReferenceImages={setReferenceImages}
            onPickFromLibrary={() => setIsImagePickerOpen(true)}
          />
        ) : undefined
      }
      settingsFields={
        <>
          {hasAspectRatios && (
            <MobileSelectField
              label="Aspect ratio"
              items={buildAspectRatioItems(
                selectedModel?.aspect_ratio_options ?? [],
                aspectRatio ?? selectedModel?.aspect_ratio_default ?? undefined,
              )}
              onSelect={(item) => {
                const r = aspectRatioFromLabel(item.label);
                if (r) setAspectRatio(r);
              }}
            />
          )}
          {(hasResolutions || hasQualityOptions) && (
            <>
              <MobileFieldButton
                label="Output"
                value={outputSummary}
                onClick={() => setIsOutputDrawerOpen(true)}
              />
              <SettingsDrawer
                open={isOutputDrawerOpen}
                onOpenChange={setIsOutputDrawerOpen}
                title="Output"
              >
                {hasResolutions && (
                  <DrawerSection label="Resolution">
                    <DrawerOptionList
                      items={resolutionItems}
                      onSelect={(item) => {
                        const r = resolutionFromLabel(item.label);
                        if (r) setResolution(r);
                      }}
                    />
                  </DrawerSection>
                )}
                {hasQualityOptions && (
                  <DrawerSection label="Quality">
                    <DrawerOptionList
                      items={qualityItems}
                      onSelect={(item) => {
                        const q = qualityFromLabel(item.label);
                        if (q) setQuality(q);
                      }}
                    />
                  </DrawerSection>
                )}
              </SettingsDrawer>
            </>
          )}
        </>
      }
      countField={undefined}
    />
  );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <CreateMediaPageShell
      title="Create Image - ArtCraft"
      description="Generate stunning AI images with ArtCraft"
      authChecked={authChecked}
      hasContent={hasContent}
      showSelectToggle
      emptyStateTitle="Create Image"
      emptyStateSubtitle="Describe anything. See it in seconds."
      emptyStateCta={
        loggedIn ? undefined : (
          <Button
            variant="primary"
            onClick={openSignupCta}
            icon={SparklesIcon}
            className="h-12 px-6"
          >
            Sign up to create
          </Button>
        )
      }
      bottomOffset={promptHeight + 24}
      modelItems={modelItems}
      onModelChange={handleModelChange}
      promptForm={mobileForm}
      gridContent={
        <GenerationGallery
          inProgressJobs={enrichedInProgress}
          failedJobs={jobs.failed}
          onDismissFailed={jobs.dismissFailed}
          newlyCompletedItems={jobs.newlyCompleted}
          galleryItems={gallery.items}
          newlyCompletedTokens={newlyCompletedTokens}
          hasMore={gallery.hasMore}
          isLoading={gallery.isLoading}
          isInitialLoading={gallery.isInitialLoading}
          onLoadMore={gallery.loadMore}
          onGalleryItemClick={lightbox.handleGalleryItemClick}
          enableMakeVideo
          selectable
          selectionBarBottomOffset={promptHeight + 24}
        />
      }
      promptBox={
        <div
          ref={promptBoxRef}
          className="animate-fade-in-up fixed bottom-2 sm:bottom-3 right-0 z-30 mx-auto max-w-6xl px-2 sm:px-4 transition-[left] duration-200 ease-linear"
          style={{
            animationDelay: "150ms",
            left: "var(--ac-sidebar-offset, 0px)",
          }}
        >
          <PromptBox
            prompt={prompt}
            onPromptChange={setPrompt}
            onSubmit={handleGenerate}
            isSubmitting={isGenerating}
            credits={estimatedCredits}
            maxPromptLength={maxPromptLength}
            placeholder={
              goClawAgents.length
                ? "Describe what you want in the image..."
                : "No image agent is available..."
            }
            supportsImagePrompts={supportsImagePrompts}
            maxImagePromptCount={maxImageRefs}
            referenceImages={referenceImages}
            onReferenceImagesChange={setReferenceImages}
            onPickFromLibrary={() => setIsImagePickerOpen(true)}
            modelSelector={
              <div className="flex items-center gap-1">
                <Tooltip
                  content="Model"
                  position="top"
                  className="z-50"
                  closeOnClick
                >
                  <PopoverMenu
                    items={groupedModelItems}
                    onSelect={handleModelChange}
                    mode="toggle"
                    panelTitle="Select Model"
                    panelClassName="w-[280px]"
                    richList
                    triggerIcon={<SparklesIcon className="h-4 w-4" />}
                  />
                </Tooltip>
              </div>
            }
            leftToolbar={
              <>
                {hasAspectRatios && selectedModel && (
                  <AspectRatioPicker
                    aspectRatioOptions={
                      selectedModel.aspect_ratio_options ?? []
                    }
                    defaultAspectRatio={
                      selectedModel.aspect_ratio_default ?? undefined
                    }
                    currentAspectRatio={aspectRatio}
                    handleAspectRatioSelect={setAspectRatio}
                  />
                )}
                {hasResolutions && selectedModel && (
                  <ResolutionPicker
                    resolutionOptions={selectedModel.resolution_options ?? []}
                    defaultResolution={
                      selectedModel.resolution_default ?? undefined
                    }
                    currentResolution={resolution}
                    handleResolutionSelect={setResolution}
                  />
                )}
                {hasQualityOptions && selectedModel && (
                  <QualityPicker
                    qualityOptions={selectedModel.quality_options ?? []}
                    defaultQuality={selectedModel.default_quality ?? undefined}
                    currentQuality={quality}
                    handleQualitySelect={setQuality}
                  />
                )}
              </>
            }
            rightToolbar={undefined}
          />
        </div>
      }
      modals={
        <>
          <GalleryModal
            mode="select"
            isOpen={isImagePickerOpen}
            onClose={() => setIsImagePickerOpen(false)}
            selectedItemIds={pickerSelectedIds}
            disabledItemIds={usedImageTokens}
            onSelectItem={handlePickerSelect}
            maxSelections={imagePickerMax}
            onUseSelected={handleLibraryImageSelect}
            forceFilter="image"
            hideFilter
          />
          <Lightbox
            isOpen={lightbox.lightboxOpen}
            onClose={lightbox.closeLightbox}
            mediaToken={lightbox.lightboxItem?.id}
            cdnUrl={lightbox.lightboxItem?.fullImage}
            mediaClass={lightbox.lightboxItem?.mediaClass}
            batchImageToken={lightbox.lightboxItem?.batchImageToken}
            showBatchCarousel={false}
            onNavigatePrev={lightbox.navigatePrev}
            onNavigateNext={lightbox.navigateNext}
            onDeleted={gallery.removeItem}
          />
        </>
      }
    />
  );
}

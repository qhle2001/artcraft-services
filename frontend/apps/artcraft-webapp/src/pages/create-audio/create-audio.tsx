import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterMediaClasses } from "@storyteller/api";
import type { OmniGenAudioModelDetails } from "@storyteller/api";
import { PopoverMenu, type PopoverItem } from "@storyteller/ui-popover";
import { Tooltip } from "@storyteller/ui-tooltip";
import { Button, ToggleButton } from "@storyteller/ui-button";
import { SliderV2 } from "@storyteller/ui-sliderv2";
import { GalleryModal, type GalleryItem } from "@storyteller/ui-gallery-modal";
import {
  AudioTuningPopover,
  SoundsSettingsPopover,
  StylePromptRow,
  MUSICAL_KEYS,
  formatSampleRateHz,
  AUDIO_BPM_MIN,
  AUDIO_BPM_MAX,
  AUDIO_SPEED_MIN,
  AUDIO_SPEED_MAX,
  AUDIO_VOLUME_MIN,
  AUDIO_VOLUME_MAX,
  AUDIO_PITCH_MIN,
  AUDIO_PITCH_MAX,
} from "@storyteller/ui-promptbox";
import {
  PromptBox,
  ImagePromptRow,
  MediaReferenceRow,
  MobilePromptForm,
  MobileSelectField,
  MobileFieldButton,
  SettingsDrawer,
  DrawerOptionList,
  DrawerSection,
  getAudioDurationFromUrl,
  type RefAudio,
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
import { useCreateAudioStore } from "./create-audio-store";
import { resolveModelNumberOption } from "../../lib/resolve-model-setting";
import { useOmniGenAudioModels } from "@storyteller/omni-gen";
import { toast } from "../../components/toast/toast";
import { useSignupCta } from "../../components/signup-cta-modal";
import { MicIcon, MicOffIcon, RepeatIcon, SparklesIcon } from "lucide-react";
import { goClawAction } from "../../re-implement/goclaw/goClawStore";
import { useGoClawAgents } from "../../re-implement/goclaw/useGoClawAgents";
import { generateGoClawMedia } from "../../re-implement/goclaw/generateGoClawMedia";

// ── Constants ────────────────────────────────────────────────────────────

const DEFAULT_MODEL_ID = "suno_music";

const AUDIO_FILTER = [FilterMediaClasses.AUDIO];

const AUDIO_REF_MAX_DURATION_SECONDS = 600;

// The lib ToggleButton still carries the old glassy look (2px transparent
// border, grey translucent blur). These overrides align the audio toggles
// with their sibling toolbar controls (the PopoverMenu triggers): flat
// ui-controls surface, 1px hairline border, 4px corners. Active keeps the
// brand tint as the on-state affordance.
const toolbarToggleClassName = (isActive: boolean): string =>
  isActive
    ? "rounded-[3px] border border-ui-controls-border backdrop-blur-none hover:border-ui-controls-border"
    : "rounded-[3px] border border-ui-controls-border bg-ui-controls backdrop-blur-none hover:bg-ui-controls/80";

// ── Component ────────────────────────────────────────────────────────────

export default function CreateAudio() {
  const { user, authChecked } = useAuthCheck();
  const { loggedIn, openSignupCta } = useSignupCta();
  const { promptBoxRef, promptHeight } = usePromptHeight();

  // Fetch models from API
  const { models: apiModels } = useOmniGenAudioModels();
  const { agents: configuredAgents } = useGoClawAgents();
  const audioAgents = useMemo(() => configuredAgents.filter((agent) => agent.type === "audio"), [configuredAgents]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const selectedAgent =
    audioAgents.find((agent) => agent.id === selectedAgentId) ?? audioAgents[0];

  // UI state
  const ui = useCreateAudioStore((s) => s.ui);
  const setUi = useCreateAudioStore((s) => s.setUi);

  const selectedModel = useMemo((): OmniGenAudioModelDetails | undefined => {
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

  const prompt = ui.prompt;
  const setPrompt = useCallback((v: string) => setUi({ prompt: v }), [setUi]);
  const setStylePrompt = useCallback(
    (v: string) => setUi({ stylePrompt: v }),
    [setUi],
  );

  // Capability gating. Flags are serde-skipped when absent — only `true`
  // counts as supported.
  const styleSupported = false;
  const hasInstrumental = false;
  const hasKeepLyrics = false;
  const hasLoopable = false;
  const hasBpm = false;
  const hasMusicalKey = false;
  const sampleRateOptions: number[] = [];
  const hasSpeed = false;
  const hasVolume = false;
  const hasPitch = false;
  const hasTuning =
    !!sampleRateOptions?.length || hasSpeed || hasVolume || hasPitch;
  const audioRefsSupported = !!selectedAgent;
  const maxAudioRefs = selectedAgent ? 6 : 0;
  const imageRefsSupported = !!selectedAgent;
  const maxImageRefs = selectedAgent ? 6 : 0;
  // Seed Audio output shaping — sticky across model switches; numeric sliders
  // clamp at read time so persisted values always stay in the valid range.
  const sampleRateHz =
    resolveModelNumberOption(
      ui.sampleRateHz,
      sampleRateOptions,
      selectedModel?.sample_rate_hz_default,
    ) ?? null;
  const speed = clamp(ui.speed, AUDIO_SPEED_MIN, AUDIO_SPEED_MAX);
  const volume = clamp(ui.volume, AUDIO_VOLUME_MIN, AUDIO_VOLUME_MAX);
  const pitch = clamp(ui.pitch, AUDIO_PITCH_MIN, AUDIO_PITCH_MAX);

  const [isGenerating, setIsGenerating] = useState(false);
  const referenceAudios = useCreateAudioStore((s) => s.referenceAudios);
  const setReferenceAudios = useCreateAudioStore((s) => s.setReferenceAudios);
  const referenceImages = useCreateAudioStore((s) => s.referenceImages);
  const setReferenceImages = useCreateAudioStore((s) => s.setReferenceImages);
  const [isImagePickerOpen, setIsImagePickerOpen] = useState(false);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<string[]>([]);
  const [isAudioPickerOpen, setIsAudioPickerOpen] = useState(false);
  const [audioPickerSelectedIds, setAudioPickerSelectedIds] = useState<
    string[]
  >([]);
  const [isBeatDrawerOpen, setIsBeatDrawerOpen] = useState(false);
  const [isTuningDrawerOpen, setIsTuningDrawerOpen] = useState(false);

  useEffect(() => {
    if (isImagePickerOpen) setPickerSelectedIds([]);
  }, [isImagePickerOpen]);

  useEffect(() => {
    if (isAudioPickerOpen) setAudioPickerSelectedIds([]);
  }, [isAudioPickerOpen]);

  const handlePickerSelect = useCallback(
    (id: string) => {
      setPickerSelectedIds((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        if (prev.length >= maxImageRefs) {
          return maxImageRefs === 1 ? [id] : prev;
        }
        return [...prev, id];
      });
    },
    [maxImageRefs],
  );

  // Jobs + gallery
  const jobs = useGenerationJobs({ mediaType: "audio", enabled: !!user });
  const gallery = useGalleryData({
    username: user?.username ?? null,
    filterMediaClasses: AUDIO_FILTER,
    excludeUploads: true,
  });

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

  const estimatedCredits = null;

  const modelItems = useMemo(
    () =>
      audioAgents.map((agent): PopoverItem => ({
        label: agent.name,
        description: `GoClaw · ${agent.description || "Audio agent"}`,
        action: goClawAction(agent.id),
        selected: agent.id === selectedAgent?.id,
      })),
    [audioAgents, selectedAgent?.id],
  );

  const hasContent =
    jobs.inProgress.length > 0 ||
    jobs.failed.length > 0 ||
    jobs.newlyCompleted.length > 0 ||
    gallery.items.length > 0 ||
    gallery.isInitialLoading;

  const canGenerate = !!selectedAgent && !!prompt.trim() && !isGenerating;

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleModelChange = useCallback(
    (item: PopoverItem) => {
      if (item.action?.startsWith("goclaw-agent:")) {
        setSelectedAgentId(item.action.slice("goclaw-agent:".length));
        return;
      }
    },
    [],
  );

  // Seed Audio can't combine audio and image references — adding one kind
  // clears the other so the request is always valid.
  const handleReferenceAudiosChange = useCallback(
    (audios: typeof referenceAudios) => {
      if (audios.length > 0 && referenceImages.length > 0) {
        setReferenceImages([]);
        toast.error(
          "Removed image reference — it can't be combined with audio",
        );
      }
      setReferenceAudios(audios);
    },
    [referenceImages, setReferenceAudios, setReferenceImages],
  );

  const handleReferenceImagesChange = useCallback(
    (images: RefImage[]) => {
      if (images.length > 0 && referenceAudios.length > 0) {
        setReferenceAudios([]);
        toast.error(
          "Removed audio reference — it can't be combined with an image",
        );
      }
      setReferenceImages(images);
    },
    [referenceAudios, setReferenceAudios, setReferenceImages],
  );

  const audioPickerMax = Math.max(1, maxAudioRefs - referenceAudios.length);

  const handleAudioPickerSelect = useCallback(
    (id: string) => {
      setAudioPickerSelectedIds((prev) => {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        if (prev.length >= audioPickerMax) {
          return audioPickerMax === 1 ? [id] : prev;
        }
        return [...prev, id];
      });
    },
    [audioPickerMax],
  );

  const handleLibraryAudioSelect = useCallback(
    async (items: GalleryItem[]) => {
      setIsAudioPickerOpen(false);
      const availableSlots = Math.max(0, maxAudioRefs - referenceAudios.length);
      const picked = items.slice(0, availableSlots);

      const added: RefAudio[] = [];
      let total = referenceAudios.reduce((sum, a) => sum + a.duration, 0);
      for (const item of picked) {
        const url = item.fullImage;
        if (!url) continue;
        const duration =
          item.durationMillis != null
            ? Math.round(item.durationMillis / 1000)
            : await getAudioDurationFromUrl(url);
        if (duration <= 0) {
          toast.error("Could not read audio file");
          continue;
        }
        if (total + duration > AUDIO_REF_MAX_DURATION_SECONDS) {
          toast.error(
            `Total audio duration cannot exceed ${AUDIO_REF_MAX_DURATION_SECONDS}s`,
          );
          continue;
        }
        total += duration;
        added.push({
          id: Math.random().toString(36).substring(7),
          url,
          file: new File([], "library-audio"),
          mediaToken: item.id,
          duration,
        });
      }
      if (added.length > 0) {
        handleReferenceAudiosChange([...referenceAudios, ...added]);
      }
    },
    [referenceAudios, maxAudioRefs, handleReferenceAudiosChange],
  );

  const handleLibraryImageSelect = useCallback(
    (items: GalleryItem[]) => {
      const newImages: RefImage[] = items
        .slice(0, maxImageRefs)
        .map((item) => ({
          id: Math.random().toString(36).substring(7),
          url: item.thumbnail || item.fullImage || "",
          fullUrl: item.fullImage || undefined,
          file: new File([], "library-image"),
          mediaToken: item.id,
        }));
      handleReferenceImagesChange(newImages);
      setIsImagePickerOpen(false);
    },
    [maxImageRefs, handleReferenceImagesChange],
  );

  // Refs already in each slot, greyed out in that slot's picker so the same
  // media file can't be added twice to one field.
  const usedImageTokens = useMemo(
    () =>
      referenceImages
        .map((img) => img.mediaToken)
        .filter((t): t is string => !!t),
    [referenceImages],
  );

  const usedAudioTokens = useMemo(
    () =>
      referenceAudios
        .map((audio) => audio.mediaToken)
        .filter((t): t is string => !!t),
    [referenceAudios],
  );

  const handleGenerate = useCallback(async () => {
    if (!loggedIn) {
      openSignupCta();
      return;
    }
    if (!selectedAgent) {
      toast.error("No GoClaw audio agent is available. Contact the server administrator.");
      return;
    }
    if (!prompt.trim() || isGenerating) return;

    const referenceMediaTokens = [
      ...referenceAudios.map((item) => item.mediaToken),
      ...referenceImages.map((item) => item.mediaToken),
    ].filter((token): token is string => !!token);
    if (referenceMediaTokens.length > 10) {
      toast.error("GoClaw accepts up to 10 reference files per request.");
      return;
    }

    setIsGenerating(true);
    try {
      const media = await generateGoClawMedia({
        type: "audio",
        agentId: selectedAgent.id,
        prompt: prompt.trim(),
        referenceMediaTokens,
      });
      if (!media.length) throw new Error("GoClaw returned no audio file.");
      gallery.refresh();
      toast.success(`GoClaw created ${media.length} audio file(s).`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "GoClaw generation failed");
    } finally {
      setIsGenerating(false);
    }
  }, [
    loggedIn,
    openSignupCta,
    prompt,
    isGenerating,
    selectedAgent,
    gallery.refresh,
    referenceAudios,
    referenceImages,
  ]);

  // ── Toolbar pieces (shared between desktop promptbox + fullscreen) ────

  const toggleButtons = (
    <>
      {hasInstrumental && (
        <Tooltip
          content={ui.isInstrumental ? "Instrumental: ON" : "Instrumental: OFF"}
          position="top"
          className="z-50"
          delay={200}
        >
          <ToggleButton
            isActive={ui.isInstrumental}
            icon={MicOffIcon}
            activeIcon={MicOffIcon}
            label="Instrumental"
            className={toolbarToggleClassName(ui.isInstrumental)}
            onClick={() => setUi({ isInstrumental: !ui.isInstrumental })}
          />
        </Tooltip>
      )}
      {hasKeepLyrics && (
        <Tooltip
          content={ui.keepLyrics ? "Keep lyrics: ON" : "Keep lyrics: OFF"}
          position="top"
          className="z-50"
          delay={200}
        >
          <ToggleButton
            isActive={ui.keepLyrics}
            icon={MicIcon}
            activeIcon={MicIcon}
            label="Keep lyrics"
            className={toolbarToggleClassName(ui.keepLyrics)}
            onClick={() => setUi({ keepLyrics: !ui.keepLyrics })}
          />
        </Tooltip>
      )}
      {hasLoopable && (
        <Tooltip
          content={ui.isLoopable ? "Loop: ON" : "Loop: OFF"}
          position="top"
          className="z-50"
          delay={200}
        >
          <ToggleButton
            isActive={ui.isLoopable}
            icon={RepeatIcon}
            activeIcon={RepeatIcon}
            label="Loop"
            className={toolbarToggleClassName(ui.isLoopable)}
            onClick={() => setUi({ isLoopable: !ui.isLoopable })}
          />
        </Tooltip>
      )}
    </>
  );

  const leftToolbar = (
    <>
      {toggleButtons}
      {(hasBpm || hasMusicalKey) && (
        <SoundsSettingsPopover
          showBpm={hasBpm}
          bpm={ui.bpm}
          onBpmChange={(bpm) => setUi({ bpm })}
          showMusicalKey={hasMusicalKey}
          musicalKey={ui.musicalKey}
          onMusicalKeyChange={(musicalKey) => setUi({ musicalKey })}
        />
      )}
      {hasTuning && (
        <AudioTuningPopover
          sampleRateOptions={sampleRateOptions}
          sampleRateHz={sampleRateHz}
          onSampleRateChange={(hz) => setUi({ sampleRateHz: hz })}
          showSpeed={hasSpeed}
          speed={speed}
          onSpeedChange={(v) => setUi({ speed: v })}
          showVolume={hasVolume}
          volume={volume}
          onVolumeChange={(v) => setUi({ volume: v })}
          showPitch={hasPitch}
          pitch={pitch}
          onPitchChange={(v) => setUi({ pitch: v })}
        />
      )}
    </>
  );

  // Mobile-only band; on desktop the audio refs live in the reference deck.
  const audioReferenceRow = audioRefsSupported ? (
    <MediaReferenceRow
      videoSupported={false}
      audioSupported
      referenceVideos={[]}
      onReferenceVideosChange={() => {}}
      maxVideoCount={0}
      maxVideoRefDuration={0}
      referenceAudios={referenceAudios}
      onReferenceAudiosChange={handleReferenceAudiosChange}
      maxAudioCount={maxAudioRefs}
      maxAudioRefDuration={AUDIO_REF_MAX_DURATION_SECONDS}
      onPickAudioFromLibrary={() => setIsAudioPickerOpen(true)}
    />
  ) : undefined;

  // ── Mobile form ────────────────────────────────────────────────────────

  const beatSummary = [
    hasBpm ? (ui.bpm === null ? "Auto BPM" : `${ui.bpm} BPM`) : null,
    hasMusicalKey
      ? (MUSICAL_KEYS.find((k) => k.value === ui.musicalKey)?.label ?? "Auto")
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const tuningSummary = [
    sampleRateOptions?.length && sampleRateHz
      ? formatSampleRateHz(sampleRateHz)
      : null,
    hasSpeed ? `${speed.toFixed(2)}×` : null,
    hasPitch && pitch !== 0 ? `${pitch > 0 ? "+" : ""}${pitch} st` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const mobileForm = (
    <MobilePromptForm
      prompt={prompt}
      onPromptChange={setPrompt}
      onSubmit={handleGenerate}
      isSubmitting={isGenerating}
      credits={estimatedCredits}
      placeholder={
        audioAgents.length
          ? "Describe the music or sound you want..."
          : "No audio agent is available..."
      }
      autoAdvance={loggedIn && canGenerate}
      modelField={
        <MobileSelectField
          label="Model"
          title="Select Model"
          items={modelItems}
          onSelect={handleModelChange}
        />
      }
      frames={
        imageRefsSupported ? (
          <ImagePromptRow
            maxImagePromptCount={maxImageRefs}
            referenceImages={referenceImages}
            setReferenceImages={handleReferenceImagesChange}
            onPickFromLibrary={() => setIsImagePickerOpen(true)}
          />
        ) : undefined
      }
      mediaRefs={audioReferenceRow}
      settingsFields={
        <>
          {styleSupported && (
            <div className="rounded-[3px] border border-ui-panel-border bg-ui-controls px-3 py-1.5">
              <StylePromptRow
                value={ui.stylePrompt}
                onChange={setStylePrompt}
                className="border-t-0 pt-0"
              />
            </div>
          )}
          {(hasInstrumental || hasKeepLyrics || hasLoopable) && (
            <div className="flex flex-wrap items-center gap-2">
              {toggleButtons}
            </div>
          )}
          {(hasBpm || hasMusicalKey) && (
            <>
              <MobileFieldButton
                label="Beat & Key"
                value={beatSummary || "Auto"}
                onClick={() => setIsBeatDrawerOpen(true)}
              />
              <SettingsDrawer
                open={isBeatDrawerOpen}
                onOpenChange={setIsBeatDrawerOpen}
                title="Beat & Key"
              >
                {hasBpm && (
                  <DrawerSection label="BPM">
                    <MobileSliderRow
                      valueLabel={ui.bpm === null ? "Auto" : `${ui.bpm}`}
                      min={AUDIO_BPM_MIN}
                      max={AUDIO_BPM_MAX}
                      step={1}
                      value={ui.bpm ?? 120}
                      onChange={(bpm) => setUi({ bpm })}
                      onReset={
                        ui.bpm !== null ? () => setUi({ bpm: null }) : undefined
                      }
                    />
                  </DrawerSection>
                )}
                {hasMusicalKey && (
                  <DrawerSection label="Musical key">
                    <DrawerOptionList
                      items={MUSICAL_KEYS.map((key) => ({
                        label: key.label,
                        selected: key.value === ui.musicalKey,
                        action: key.value,
                      }))}
                      onSelect={(item) => {
                        if (item.action) setUi({ musicalKey: item.action });
                      }}
                    />
                  </DrawerSection>
                )}
              </SettingsDrawer>
            </>
          )}
          {hasTuning && (
            <>
              <MobileFieldButton
                label="Tuning"
                value={tuningSummary || "Default"}
                onClick={() => setIsTuningDrawerOpen(true)}
              />
              <SettingsDrawer
                open={isTuningDrawerOpen}
                onOpenChange={setIsTuningDrawerOpen}
                title="Tuning"
              >
                {!!sampleRateOptions?.length && (
                  <DrawerSection label="Sample rate">
                    <DrawerOptionList
                      items={sampleRateOptions.map((hz) => ({
                        label: formatSampleRateHz(hz),
                        selected: hz === sampleRateHz,
                        action: String(hz),
                      }))}
                      onSelect={(item) => {
                        if (item.action)
                          setUi({ sampleRateHz: Number(item.action) });
                      }}
                    />
                  </DrawerSection>
                )}
                {hasSpeed && (
                  <DrawerSection label="Speed">
                    <MobileSliderRow
                      valueLabel={`${speed.toFixed(2)}×`}
                      min={AUDIO_SPEED_MIN}
                      max={AUDIO_SPEED_MAX}
                      step={0.05}
                      value={speed}
                      onChange={(v) => setUi({ speed: v })}
                    />
                  </DrawerSection>
                )}
                {hasVolume && (
                  <DrawerSection label="Volume">
                    <MobileSliderRow
                      valueLabel={`${volume.toFixed(2)}×`}
                      min={AUDIO_VOLUME_MIN}
                      max={AUDIO_VOLUME_MAX}
                      step={0.05}
                      value={volume}
                      onChange={(v) => setUi({ volume: v })}
                    />
                  </DrawerSection>
                )}
                {hasPitch && (
                  <DrawerSection label="Pitch">
                    <MobileSliderRow
                      valueLabel={`${pitch > 0 ? "+" : ""}${pitch} st`}
                      min={AUDIO_PITCH_MIN}
                      max={AUDIO_PITCH_MAX}
                      step={1}
                      value={pitch}
                      onChange={(v) => setUi({ pitch: v })}
                    />
                  </DrawerSection>
                )}
              </SettingsDrawer>
            </>
          )}
        </>
      }
    />
  );

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <CreateMediaPageShell
      title="Create Audio - ArtCraft"
      description="Generate music and sound effects with ArtCraft"
      authChecked={authChecked}
      hasContent={hasContent}
      emptyStateTitle="Create Audio"
      emptyStateSubtitle="Describe a song, a sound, or a sample. Hear it in minutes."
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
          inProgressJobs={jobs.inProgress}
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
            disabled={!canGenerate}
            credits={estimatedCredits}
            placeholder={
              audioAgents.length
                ? "Describe the music or sound you want..."
                : "No audio agent is available..."
            }
            supportsImagePrompts={imageRefsSupported}
            maxImagePromptCount={maxImageRefs}
            referenceImages={referenceImages}
            onReferenceImagesChange={handleReferenceImagesChange}
            onPickFromLibrary={() => setIsImagePickerOpen(true)}
            audioRefsSupported={audioRefsSupported}
            referenceAudios={referenceAudios}
            onReferenceAudiosChange={handleReferenceAudiosChange}
            maxAudioCount={maxAudioRefs}
            maxAudioRefDuration={AUDIO_REF_MAX_DURATION_SECONDS}
            onPickAudioFromLibrary={() => setIsAudioPickerOpen(true)}
            onClearAllExtras={() => setStylePrompt("")}
            hasClearableExtras={ui.stylePrompt.length > 0}
            secondaryPromptRow={
              styleSupported ? (
                <StylePromptRow
                  value={ui.stylePrompt}
                  onChange={setStylePrompt}
                />
              ) : undefined
            }
            modelSelector={
              <Tooltip
                content="Model"
                position="top"
                className="z-50"
                closeOnClick
              >
                <PopoverMenu
                  items={modelItems}
                  onSelect={handleModelChange}
                  mode="toggle"
                  panelTitle="Select Model"
                  panelClassName="w-[360px]"
                  richList
                  triggerIcon={
                    <SparklesIcon className="h-4 w-4" />
                  }
                />
              </Tooltip>
            }
            leftToolbar={leftToolbar}
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
            maxSelections={maxImageRefs}
            onUseSelected={handleLibraryImageSelect}
            forceFilter="image"
            hideFilter
          />
          <GalleryModal
            mode="select"
            isOpen={isAudioPickerOpen}
            onClose={() => setIsAudioPickerOpen(false)}
            selectedItemIds={audioPickerSelectedIds}
            disabledItemIds={usedAudioTokens}
            onSelectItem={handleAudioPickerSelect}
            maxSelections={audioPickerMax}
            onUseSelected={handleLibraryAudioSelect}
            forceFilter="audio"
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

// ── Helpers ──────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface MobileSliderRowProps {
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  onReset?: () => void;
}

function MobileSliderRow({
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
  onReset,
}: MobileSliderRowProps) {
  return (
    <div className="px-1 py-1.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium tabular-nums text-base-fg">
          {valueLabel}
        </span>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="bg-white/5 px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-base-fg/60 transition-colors hover:bg-white/10 hover:text-base-fg"
          >
            Auto
          </button>
        )}
      </div>
      <SliderV2
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        variant="filled"
      />
    </div>
  );
}

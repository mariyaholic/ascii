import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { BatchModal } from './components/BatchModal';
import { CharRampEditorModal } from './components/CharRampEditorModal';
import { CRTCanvasViewport } from './components/CRTCanvasViewport';
import { ExportModal } from './components/ExportModal';
import { InspectorControls } from './components/InspectorControls';
import {
  MobileBottomBar,
  type MobileSheetId,
  mobileSheetToInspectorTab,
} from './components/MobileBottomBar';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PaletteEditorModal } from './components/PaletteEditorModal';
import { PWAUpdateToast } from './components/PWAUpdateToast';
import { PresetsModal } from './components/PresetsModal';
import { SimpleControls } from './components/SimpleControls';
import { StudioHeader } from './components/StudioHeader';
import { Segmented } from './components/ui/Modal';
import {
  BUILT_IN_CHAR_RAMPS,
  BUILT_IN_PALETTES,
  BUILT_IN_PRESETS,
  DEFAULT_RENDER_SETTINGS,
  SAMPLE_IMAGES,
} from './data/presets';
import { processImageBuffer } from './engine/imageProcessor';
import { computeLocalAutoTune } from './engine/localAutoTuner';
import { useLocalStorageState } from './hooks/useLocalStorageState';
import { IDLE_TUNE, tuneReducer } from './state/tuneSession';
import type {
  CharRampDefinition,
  PaletteDefinition,
  PhosphorTheme,
  RenderResult,
  RenderSettings,
  SourceImageInfo,
  StudioPreset,
  WorkspaceSection,
} from './types/studio';
import type { WorkerRenderRequest, WorkerRenderResponse } from './workers/renderWorker';

interface CachedSourcePixels {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  thumbnailBase64?: string;
}

type ControlComplexity = 'simple' | 'pro';

type StudioPanel = 'palettes' | 'characters' | 'presets' | 'batch';

/**
 * Exactly one overlay may be open at a time. Keeping this a union (instead of a
 * boolean per dialog) makes "two dialogs open" and "export with nothing to
 * export" unrepresentable states.
 */
type StudioOverlay = StudioPanel | 'export' | null;

const STUDIO_PANELS: readonly StudioPanel[] = ['palettes', 'characters', 'presets', 'batch'];

function readOverlayFromLocation(): StudioOverlay {
  if (typeof window === 'undefined') return null;
  const panel = new URLSearchParams(window.location.search).get('panel');
  return STUDIO_PANELS.includes(panel as StudioPanel) ? (panel as StudioPanel) : null;
}

function writeOverlayToLocation(overlay: StudioOverlay) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (overlay && overlay !== 'export') url.searchParams.set('panel', overlay);
  else url.searchParams.delete('panel');
  if (url.href !== window.location.href) {
    window.history.replaceState(window.history.state, '', url);
  }
}

function computeAutoFitColumns(imgWidth: number, imgHeight: number): number {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const maxDefault = isMobile ? 84 : 136;
  const minDefault = isMobile ? 48 : 64;
  const ratio = imgWidth / Math.max(1, imgHeight);
  const suggested = Math.round(
    Math.min(imgWidth / 6, 112 * Math.sqrt(Math.min(1.8, Math.max(0.6, ratio))))
  );
  return Math.max(minDefault, Math.min(maxDefault, suggested));
}

function createJpegThumbnailBase64(img: HTMLImageElement): string | undefined {
  try {
    const maxThumb = 360;
    const scale = Math.min(1, maxThumb / Math.max(img.naturalWidth, img.naturalHeight));
    const tw = Math.max(1, Math.round(img.naturalWidth * scale));
    const th = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0, tw, th);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
    return dataUrl.split(',')[1];
  } catch {
    return undefined;
  }
}

export default function App() {
  const [settings, setSettings] = useLocalStorageState<RenderSettings>(
    'pg.settings.v1',
    DEFAULT_RENDER_SETTINGS
  );
  const [controlMode, setControlMode] = useLocalStorageState<ControlComplexity>(
    'pg.controlMode.v1',
    'simple'
  );
  const [phosphorTheme, setPhosphorTheme] = useLocalStorageState<PhosphorTheme>(
    'pg.phosphor.v1',
    'p31'
  );
  const [customPalettes, setCustomPalettes] = useLocalStorageState<PaletteDefinition[]>(
    'pg.palettes.v1',
    []
  );
  const [customRamps, setCustomRamps] = useLocalStorageState<CharRampDefinition[]>(
    'pg.ramps.v1',
    []
  );
  const [customPresets, setCustomPresets] = useLocalStorageState<StudioPreset[]>(
    'pg.presets.v1',
    []
  );

  // A single overlay owns every dialog. `activeSection` is derived from it, so
  // the header cannot claim a panel is open while a different dialog is shown.
  const [overlay, setOverlay] = useState<StudioOverlay>(() => readOverlayFromLocation());
  const [mobileSheet, setMobileSheet] = useState<MobileSheetId>('none');
  const activeSection: WorkspaceSection = overlay && overlay !== 'export' ? overlay : 'studio';

  const [sourceImage, setSourceImage] = useState<SourceImageInfo | null>(null);
  // Bumped whenever new pixels arrive, so a render is triggered even when the
  // new image happens to need identical settings (the old code keyed the render
  // effect off the settings object alone and could leave the previous image on
  // screen).
  const [sourceRevision, setSourceRevision] = useState(0);
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-tune is one explicit session (see src/state/tuneSession.ts). The ref
  // is the synchronous gate for async answers: bumping it on cancel makes any
  // in-flight request stale before React has re-rendered.
  const [tune, dispatchTune] = useReducer(tuneReducer, IDLE_TUNE);
  const tuneRequestRef = useRef(0);
  const isAutoTuning = tune.phase === 'tuning';
  const tuneSummary = tune.phase === 'tuned' ? tune.summary : null;
  const tuneSource = tune.phase === 'tuned' ? tune.source : null;
  const tuneError = tune.phase === 'tuned' ? tune.notice : null;
  const canUndoTune = tune.phase === 'tuned';

  // Latest image request; a slower decode of an earlier pick must not win.
  const loadRequestRef = useRef(0);

  const cachedPixelsRef = useRef<CachedSourcePixels | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const jobIdRef = useRef<number>(0);

  const allPalettes = useMemo(
    () => [...BUILT_IN_PALETTES, ...customPalettes],
    [customPalettes]
  );
  const allRamps = useMemo(
    () => [...BUILT_IN_CHAR_RAMPS, ...customRamps],
    [customRamps]
  );
  const allPresets = useMemo(
    () => [...BUILT_IN_PRESETS, ...customPresets],
    [customPresets]
  );

  const activePalette = useMemo(
    () => allPalettes.find((p) => p.id === settings.paletteId) ?? BUILT_IN_PALETTES[0],
    [allPalettes, settings.paletteId]
  );

  const activeRamp = useMemo(
    () => allRamps.find((r) => r.id === settings.charRampId) ?? BUILT_IN_CHAR_RAMPS[0],
    [allRamps, settings.charRampId]
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-phosphor', phosphorTheme);
  }, [phosphorTheme]);

  // Manifest shortcuts and shared links open a panel; closing one clears the
  // query string so a reload does not resurrect a dismissed dialog.
  useEffect(() => {
    writeOverlayToLocation(overlay);
  }, [overlay]);

  useEffect(() => {
    try {
      const worker = new Worker(new URL('./workers/renderWorker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (event: MessageEvent<WorkerRenderResponse>) => {
        const data = event.data;
        if (data.jobId !== jobIdRef.current) return;
        setRenderResult({
          cols: data.cols,
          rows: data.rows,
          mode: data.mode,
          codepoints: new Uint32Array(data.codepoints),
          fgRgba: new Uint8ClampedArray(data.fgRgba),
          bgRgba: new Uint8ClampedArray(data.bgRgba),
          renderTimeMs: data.renderTimeMs,
        });
        setIsProcessing(false);
      };
      worker.onerror = () => {
        setIsProcessing(false);
      };
      workerRef.current = worker;
      return () => {
        worker.terminate();
        workerRef.current = null;
      };
    } catch {
      workerRef.current = null;
    }
  }, []);

  const triggerRender = useCallback(() => {
    const cached = cachedPixelsRef.current;
    if (!cached) return;

    const jobId = ++jobIdRef.current;
    setIsProcessing(true);

    if (workerRef.current) {
      const copy = cached.rgba.slice();
      const payload: WorkerRenderRequest = {
        jobId,
        srcBuffer: copy.buffer as ArrayBuffer,
        srcW: cached.width,
        srcH: cached.height,
        settings,
        palette: activePalette,
        charRamp: activeRamp,
      };
      workerRef.current.postMessage(payload, [copy.buffer]);
    } else {
      const result = processImageBuffer(
        cached.rgba,
        cached.width,
        cached.height,
        settings,
        activePalette,
        activeRamp
      );
      if (jobId === jobIdRef.current) {
        setRenderResult(result);
        setIsProcessing(false);
      }
    }
  }, [settings, activePalette, activeRamp, sourceRevision]);
  // sourceRevision is intentionally a dependency: new pixels must re-run the
  // render even when the settings object is unchanged.

  useEffect(() => {
    triggerRender();
  }, [triggerRender]);

  const clearTuneSession = useCallback(() => {
    tuneRequestRef.current++;
    dispatchTune({ type: 'CANCEL' });
  }, []);

  const openOverlay = useCallback(
    (next: StudioOverlay) => {
      // Export has no empty state; refuse to open it without a render.
      if (next === 'export' && !renderResult) return;
      setMobileSheet('none');
      setOverlay(next);
    },
    [renderResult]
  );

  const closeOverlay = useCallback(() => setOverlay(null), []);

  const loadImageSource = useCallback(
    (id: string, name: string, src: string, isObjectUrl = false) => {
      setErrorMessage(null);
      clearTuneSession();
      const loadId = ++loadRequestRef.current;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (loadId !== loadRequestRef.current) {
          if (isObjectUrl) URL.revokeObjectURL(src);
          return;
        }
        if (objectUrlRef.current && objectUrlRef.current !== src) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
        if (isObjectUrl) {
          objectUrlRef.current = src;
        }

        const maxEdge = 1280;
        const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
        const workW = Math.max(1, Math.round(img.naturalWidth * scale));
        const workH = Math.max(1, Math.round(img.naturalHeight * scale));

        const offscreen = document.createElement('canvas');
        offscreen.width = workW;
        offscreen.height = workH;
        const ctx = offscreen.getContext('2d');
        if (!ctx) {
          setErrorMessage('Canvas 2D context is unavailable.');
          return;
        }
        ctx.drawImage(img, 0, 0, workW, workH);
        const imageData = ctx.getImageData(0, 0, workW, workH);

        cachedPixelsRef.current = {
          width: workW,
          height: workH,
          rgba: imageData.data,
          thumbnailBase64: createJpegThumbnailBase64(img),
        };

        setSourceImage({
          id,
          name,
          width: img.naturalWidth,
          height: img.naturalHeight,
          src,
        });
        setSourceRevision((revision) => revision + 1);

        setSettings((prev) =>
          prev.autoFit
            ? { ...prev, columns: computeAutoFitColumns(img.naturalWidth, img.naturalHeight) }
            : prev
        );
      };
      img.onerror = () => {
        if (loadId !== loadRequestRef.current) {
          if (isObjectUrl) URL.revokeObjectURL(src);
          return;
        }
        setErrorMessage(`Could not decode "${name}". Try PNG, JPG, WebP, or GIF.`);
      };
      img.src = src;
    },
    [setSettings, clearTuneSession]
  );

  useEffect(() => {
    const first = SAMPLE_IMAGES[0];
    loadImageSource(first.id, first.name, first.src);
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectFile = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      loadImageSource(`file-${Date.now()}`, file.name, url, true);
    },
    [loadImageSource]
  );

  const handleSelectSample = useCallback(
    (sampleId: string) => {
      const found = SAMPLE_IMAGES.find((s) => s.id === sampleId);
      if (found) {
        loadImageSource(found.id, found.name, found.src, false);
      }
    },
    [loadImageSource]
  );

  // Installed desktop PWA: "Open with PhosphorGrid" on an image file. Only
  // the first file is used; the batch panel handles many.
  useEffect(() => {
    const launchQueue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue;
    if (!launchQueue) return;
    launchQueue.setConsumer(async (params) => {
      const handle = params.files?.[0];
      if (!handle) return;
      try {
        handleSelectFile(await handle.getFile());
      } catch {
        setErrorMessage('Could not open the file passed to PhosphorGrid.');
      }
    });
  }, [handleSelectFile]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            handleSelectFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handleSelectFile]);

  const handleUpdateSettings = useCallback(
    (patch: Partial<RenderSettings>) => {
      setSettings((prev) => ({ ...prev, ...patch }));
    },
    [setSettings]
  );

  // Smart Auto-Tune via server-side Gemini 4 Hydrogen with automatic offline/fallback local histogram analyzer
  const handleAutoTune = useCallback(
    async (goalPrompt?: string) => {
      const cached = cachedPixelsRef.current;
      if (!cached) return;

      const requestId = ++tuneRequestRef.current;
      const isCurrent = () => requestId === tuneRequestRef.current;

      dispatchTune({ type: 'START', requestId, current: { ...settings } });
      let resolved = false;

      const applyLocalFallback = (notice?: string) => {
        if (!isCurrent()) return;
        const localRec = computeLocalAutoTune(
          cached.rgba,
          cached.width,
          cached.height,
          goalPrompt
        );
        setSettings((prev) => ({ ...prev, ...localRec.settings }));
        dispatchTune({
          type: 'RESOLVE',
          requestId,
          summary: localRec.summary,
          source: 'local',
          notice: notice ?? null,
        });
        resolved = true;
      };

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        applyLocalFallback();
        return;
      }

      try {
        const response = await fetch('/api/style-assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: cached.thumbnailBase64,
            goalPrompt,
            availablePalettes: allPalettes.map((p) => ({
              id: p.id,
              name: p.name,
              colorCount: p.colors.length,
            })),
            availableRamps: allRamps.map((r) => ({ id: r.id, name: r.name })),
          }),
        });

        if (!isCurrent()) return;

        if (!response.ok) {
          const errPayload = await response.json().catch(() => ({}));
          const notice =
            errPayload?.code === 'API_KEY_MISSING'
              ? undefined
              : 'Style model unavailable — applied a local analysis instead.';
          applyLocalFallback(notice);
          return;
        }

        const data = (await response.json()) as {
          summary?: string;
          settings?: Partial<RenderSettings>;
        };

        if (!isCurrent()) return;

        if (data?.settings) {
          setSettings((prev) => ({ ...prev, ...data.settings }));
          dispatchTune({
            type: 'RESOLVE',
            requestId,
            summary: data.summary ?? 'Tuned dithering, tone, and color balance for this image.',
            source: 'api',
          });
          resolved = true;
        } else {
          applyLocalFallback();
        }
      } catch {
        applyLocalFallback('Offline — applied a local analysis instead.');
      } finally {
        // Never leave the spinner up: if even the local analysis threw, end
        // the session without touching settings.
        if (isCurrent() && !resolved) clearTuneSession();
      }
    },
    [settings, allPalettes, allRamps, setSettings, clearTuneSession]
  );

  const handleUndoTune = () => {
    if (tune.phase !== 'tuned') return;
    setSettings(tune.snapshot);
    dispatchTune({ type: 'UNDO' });
  };

  const handleSavePalette = (palette: PaletteDefinition) => {
    setCustomPalettes((prev) => {
      const exists = prev.some((p) => p.id === palette.id);
      return exists ? prev.map((p) => (p.id === palette.id ? palette : p)) : [...prev, palette];
    });
  };

  const handleDeletePalette = (id: string) => {
    setCustomPalettes((prev) => prev.filter((p) => p.id !== id));
    if (settings.paletteId === id) {
      handleUpdateSettings({ paletteId: BUILT_IN_PALETTES[0].id });
    }
  };

  const handleSaveRamp = (ramp: CharRampDefinition) => {
    setCustomRamps((prev) => {
      const exists = prev.some((r) => r.id === ramp.id);
      return exists ? prev.map((r) => (r.id === ramp.id ? ramp : r)) : [...prev, ramp];
    });
  };

  const handleDeleteRamp = (id: string) => {
    setCustomRamps((prev) => prev.filter((r) => r.id !== id));
    if (settings.charRampId === id) {
      handleUpdateSettings({ charRampId: BUILT_IN_CHAR_RAMPS[0].id });
    }
  };

  const handleSavePreset = (name: string) => {
    const newPreset: StudioPreset = {
      id: `user-preset-${Date.now()}`,
      name,
      isBuiltIn: false,
      createdAt: Date.now(),
      settings: { ...settings },
    };
    setCustomPresets((prev) => [newPreset, ...prev]);
  };

  const handleDeletePreset = (id: string) => {
    setCustomPresets((prev) => prev.filter((p) => p.id !== id));
  };

  const handleAutoFitNow = () => {
    if (!sourceImage) return;
    handleUpdateSettings({
      columns: computeAutoFitColumns(sourceImage.width, sourceImage.height),
    });
  };

  const handleResetDefaults = () => {
    const cols = sourceImage
      ? computeAutoFitColumns(sourceImage.width, sourceImage.height)
      : DEFAULT_RENDER_SETTINGS.columns;
    setSettings({ ...DEFAULT_RENDER_SETTINGS, columns: cols });
    setPhosphorTheme('p31');
    clearTuneSession();
  };

  // Guided mode has no dither/color sheets; fall back to the style sheet so the
  // bottom bar can never point at a panel it does not render.
  useEffect(() => {
    if (controlMode === 'simple' && (mobileSheet === 'dither' || mobileSheet === 'color')) {
      setMobileSheet('mode');
    }
  }, [controlMode, mobileSheet]);

  const modeSwitcher = (
    <div className="border-b border-[var(--pg-border)] bg-[var(--pg-surface)] p-3">
      <Segmented
        value={controlMode}
        options={[
          { id: 'simple', label: 'Guided', compactLabel: 'Guided' },
          { id: 'pro', label: 'Pro', compactLabel: 'Pro' },
        ]}
        onChange={setControlMode}
      />
    </div>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--pg-bg)] text-[var(--pg-text)]">
      <StudioHeader
        activeSection={activeSection}
        canExport={renderResult !== null}
        onSelectSection={(section) => {
          if (section === 'studio') closeOverlay();
          else openOverlay(section);
        }}
        onOpenExport={() => openOverlay('export')}
      />

      <main className="pg-main-gutter flex min-h-0 flex-1 overflow-hidden">
        <CRTCanvasViewport
          sourceImage={sourceImage}
          renderResult={renderResult}
          settings={settings}
          activeRamp={activeRamp}
          isProcessing={isProcessing}
          errorMessage={errorMessage}
          onSelectFile={handleSelectFile}
          onSelectSample={handleSelectSample}
          onToggleCrt={() => handleUpdateSettings({ crtOverlay: !settings.crtOverlay })}
          onUpdateSettings={handleUpdateSettings}
        />

        {/* Desktop Right Inspector Sidebar */}
        <aside
          aria-label="Render parameters"
          className="hidden lg:flex lg:flex-col w-[348px] shrink-0 border-l border-[var(--pg-border)] bg-[var(--pg-surface)]"
        >
          {modeSwitcher}
          <div className="flex-1 overflow-y-auto pg-scroll">
            {controlMode === 'simple' ? (
              <SimpleControls
                settings={settings}
                phosphorTheme={phosphorTheme}
                isAutoTuning={isAutoTuning}
                tuneSummary={tuneSummary}
                tuneSource={tuneSource}
                tuneError={tuneError}
                canUndoTune={canUndoTune}
                onUpdateSettings={handleUpdateSettings}
                onChangePhosphorTheme={setPhosphorTheme}
                onAutoTune={handleAutoTune}
                onUndoTune={handleUndoTune}
                onResetDefaults={handleResetDefaults}
              />
            ) : (
              <InspectorControls
                settings={settings}
                phosphorTheme={phosphorTheme}
                palettes={allPalettes}
                charRamps={allRamps}
                sourceImage={sourceImage}
                renderResult={renderResult}
                sectionFilter="all"
                onUpdateSettings={handleUpdateSettings}
                onChangePhosphorTheme={setPhosphorTheme}
                onResetDefaults={handleResetDefaults}
                onOpenPaletteEditor={() => openOverlay('palettes')}
                onOpenCharEditor={() => openOverlay('characters')}
                onAutoFitNow={handleAutoFitNow}
              />
            )}
          </div>
        </aside>
      </main>

      {/* Mobile Thumb-Zone Bottom Bar & Slide-Up Inspector Sheet */}
      <MobileBottomBar
        activeSheet={mobileSheet}
        controlMode={controlMode}
        onSelectSheet={setMobileSheet}
        onOpenPalettes={() => openOverlay('palettes')}
        onOpenCharacters={() => openOverlay('characters')}
        onOpenPresets={() => openOverlay('presets')}
        onOpenBatch={() => openOverlay('batch')}
      >
        {mobileSheet === 'mode' && controlMode === 'simple' ? (
          <>
            {modeSwitcher}
            <SimpleControls
              settings={settings}
              phosphorTheme={phosphorTheme}
              isAutoTuning={isAutoTuning}
              tuneSummary={tuneSummary}
              tuneSource={tuneSource}
              tuneError={tuneError}
              canUndoTune={canUndoTune}
              onUpdateSettings={handleUpdateSettings}
              onChangePhosphorTheme={setPhosphorTheme}
              onAutoTune={handleAutoTune}
              onUndoTune={handleUndoTune}
              onResetDefaults={handleResetDefaults}
            />
          </>
        ) : (
          <>
            {mobileSheet === 'mode' && modeSwitcher}
            <InspectorControls
              settings={settings}
              phosphorTheme={phosphorTheme}
              palettes={allPalettes}
              charRamps={allRamps}
              sourceImage={sourceImage}
              renderResult={renderResult}
              sectionFilter={mobileSheetToInspectorTab(mobileSheet)}
              onUpdateSettings={handleUpdateSettings}
              onChangePhosphorTheme={setPhosphorTheme}
              onResetDefaults={handleResetDefaults}
              onOpenPaletteEditor={() => {
                setMobileSheet('none');
                openOverlay('palettes');
              }}
              onOpenCharEditor={() => {
                setMobileSheet('none');
                openOverlay('characters');
              }}
              onAutoFitNow={handleAutoFitNow}
            />
          </>
        )}
      </MobileBottomBar>

      {overlay === 'palettes' && (
        <PaletteEditorModal
          palettes={allPalettes}
          activePaletteId={settings.paletteId}
          onSelectPalette={(id) =>
            handleUpdateSettings({ paletteId: id, colorMode: 'palette' })
          }
          onSavePalette={handleSavePalette}
          onDeletePalette={handleDeletePalette}
          onClose={closeOverlay}
        />
      )}

      {overlay === 'characters' && (
        <CharRampEditorModal
          charRamps={allRamps}
          activeRampId={settings.charRampId}
          onSelectRamp={(id) => handleUpdateSettings({ charRampId: id, mode: 'ascii' })}
          onSaveRamp={handleSaveRamp}
          onDeleteRamp={handleDeleteRamp}
          onClose={closeOverlay}
        />
      )}

      {overlay === 'presets' && (
        <PresetsModal
          presets={allPresets}
          currentSettings={settings}
          onApplyPreset={(presetSettings) => {
            clearTuneSession();
            setSettings({ ...presetSettings });
          }}
          onSavePreset={handleSavePreset}
          onDeletePreset={handleDeletePreset}
          onResetDefaults={handleResetDefaults}
          onClose={closeOverlay}
        />
      )}

      {overlay === 'batch' && (
        <BatchModal
          settings={settings}
          palette={activePalette}
          charRamp={activeRamp}
          onClose={closeOverlay}
        />
      )}

      {overlay === 'export' && renderResult && (
        <ExportModal
          renderResult={renderResult}
          settings={settings}
          sourceName={sourceImage?.name ?? 'phosphorgrid'}
          onClose={closeOverlay}
        />
      )}

      {/* Offline and update notices share one stack so they can never overlap. */}
      {/* Hidden on mobile while a sheet is up: the sheet occupies the same strip. */}
      <div
        className={`pg-safe-x pg-above-bar pointer-events-none fixed inset-x-3 z-40 flex flex-col items-start gap-2 lg:inset-x-auto lg:right-4 lg:flex lg:items-end ${
          mobileSheet !== 'none' ? 'max-lg:hidden' : ''
        }`}
      >
        <OfflineIndicator />
        <PWAUpdateToast />
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { PresetsModal } from './components/PresetsModal';
import { StudioHeader } from './components/StudioHeader';
import {
  BUILT_IN_CHAR_RAMPS,
  BUILT_IN_PALETTES,
  BUILT_IN_PRESETS,
  DEFAULT_RENDER_SETTINGS,
  SAMPLE_IMAGES,
} from './data/presets';
import { processImageBuffer } from './engine/imageProcessor';
import { useLocalStorageState } from './hooks/useLocalStorageState';
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
}

function computeAutoFitColumns(imgWidth: number, imgHeight: number): number {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const maxDefault = isMobile ? 84 : 136;
  const minDefault = isMobile ? 48 : 64;
  const ratio = imgWidth / Math.max(1, imgHeight);
  const suggested = Math.round(Math.min(imgWidth / 6, 112 * Math.sqrt(Math.min(1.8, Math.max(0.6, ratio)))));
  return Math.max(minDefault, Math.min(maxDefault, suggested));
}

export default function App() {
  const [settings, setSettings] = useLocalStorageState<RenderSettings>(
    'pg.settings.v1',
    DEFAULT_RENDER_SETTINGS
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

  const [activeSection, setActiveSection] = useState<WorkspaceSection>('studio');
  const [exportOpen, setExportOpen] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<MobileSheetId>('none');

  const [sourceImage, setSourceImage] = useState<SourceImageInfo | null>(null);
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  // Sync phosphor CRT theme token on <html>
  useEffect(() => {
    document.documentElement.setAttribute('data-phosphor', phosphorTheme);
  }, [phosphorTheme]);

  // Initialize Web Worker for off-thread dithering & conversion
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
  }, [settings, activePalette, activeRamp]);

  // Re-render whenever source pixels or settings change
  useEffect(() => {
    triggerRender();
  }, [triggerRender]);

  const loadImageSource = useCallback(
    (id: string, name: string, src: string, isObjectUrl = false) => {
      setErrorMessage(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
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
        };

        setSourceImage({
          id,
          name,
          width: img.naturalWidth,
          height: img.naturalHeight,
          src,
        });

        setSettings((prev) =>
          prev.autoFit
            ? { ...prev, columns: computeAutoFitColumns(img.naturalWidth, img.naturalHeight) }
            : prev
        );
      };
      img.onerror = () => {
        setErrorMessage(`Could not decode "${name}". Try PNG, JPG, WebP, or GIF.`);
      };
      img.src = src;
    },
    [setSettings]
  );

  // Load initial sample image on mount
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

  // Global clipboard image paste (Ctrl/Cmd + V)
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
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[var(--pg-bg)] text-[var(--pg-text)]">
      <StudioHeader
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        onOpenExport={() => setExportOpen(true)}
      />

      {/* Main Responsive Workbench: Viewport + Desktop Inspector */}
      <main className="flex flex-1 min-h-0 overflow-hidden pb-14 lg:pb-0">
        <CRTCanvasViewport
          sourceImage={sourceImage}
          renderResult={renderResult}
          settings={settings}
          isProcessing={isProcessing}
          errorMessage={errorMessage}
          onSelectFile={handleSelectFile}
          onSelectSample={handleSelectSample}
          onToggleCrt={() => handleUpdateSettings({ crtOverlay: !settings.crtOverlay })}
        />

        {/* Desktop Right Inspector Sidebar */}
        <aside
          aria-label="Render parameters"
          className="hidden lg:block w-[340px] shrink-0 overflow-y-auto pg-scroll border-l border-[var(--pg-border)] bg-[var(--pg-surface)]"
        >
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
            onOpenPaletteEditor={() => setActiveSection('palettes')}
            onOpenCharEditor={() => setActiveSection('characters')}
            onAutoFitNow={handleAutoFitNow}
          />
        </aside>
      </main>

      {/* Mobile Thumb-Zone Bottom Bar & Slide-Up Inspector Sheet */}
      <MobileBottomBar
        activeSheet={mobileSheet}
        onSelectSheet={setMobileSheet}
        onOpenPalettes={() => setActiveSection('palettes')}
        onOpenCharacters={() => setActiveSection('characters')}
        onOpenPresets={() => setActiveSection('presets')}
      >
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
            setActiveSection('palettes');
          }}
          onOpenCharEditor={() => {
            setMobileSheet('none');
            setActiveSection('characters');
          }}
          onAutoFitNow={handleAutoFitNow}
        />
      </MobileBottomBar>

      {/* Editors & Modals */}
      {activeSection === 'palettes' && (
        <PaletteEditorModal
          palettes={allPalettes}
          activePaletteId={settings.paletteId}
          onSelectPalette={(id) =>
            handleUpdateSettings({ paletteId: id, colorMode: 'palette' })
          }
          onSavePalette={handleSavePalette}
          onDeletePalette={handleDeletePalette}
          onClose={() => setActiveSection('studio')}
        />
      )}

      {activeSection === 'characters' && (
        <CharRampEditorModal
          charRamps={allRamps}
          activeRampId={settings.charRampId}
          onSelectRamp={(id) => handleUpdateSettings({ charRampId: id, mode: 'ascii' })}
          onSaveRamp={handleSaveRamp}
          onDeleteRamp={handleDeleteRamp}
          onClose={() => setActiveSection('studio')}
        />
      )}

      {activeSection === 'presets' && (
        <PresetsModal
          presets={allPresets}
          currentSettings={settings}
          onApplyPreset={(presetSettings) => setSettings({ ...presetSettings })}
          onSavePreset={handleSavePreset}
          onDeletePreset={handleDeletePreset}
          onResetDefaults={handleResetDefaults}
          onClose={() => setActiveSection('studio')}
        />
      )}

      {exportOpen && (
        <ExportModal
          renderResult={renderResult}
          settings={settings}
          sourceName={sourceImage?.name ?? 'phosphorgrid'}
          onClose={() => setExportOpen(false)}
        />
      )}

      <OfflineIndicator />
    </div>
  );
}

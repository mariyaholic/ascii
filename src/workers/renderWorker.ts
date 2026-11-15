import { processImageBuffer } from '../engine/imageProcessor';
import type { CharRampDefinition, PaletteDefinition, RenderSettings } from '../types/studio';

export interface WorkerRenderRequest {
  jobId: number;
  srcBuffer: ArrayBuffer;
  srcW: number;
  srcH: number;
  settings: RenderSettings;
  palette: PaletteDefinition;
  charRamp: CharRampDefinition;
}

export interface WorkerRenderResponse {
  jobId: number;
  cols: number;
  rows: number;
  mode: RenderSettings['mode'];
  codepoints: ArrayBuffer;
  fgRgba: ArrayBuffer;
  bgRgba: ArrayBuffer;
  renderTimeMs: number;
}

self.onmessage = (event: MessageEvent<WorkerRenderRequest>) => {
  const { jobId, srcBuffer, srcW, srcH, settings, palette, charRamp } = event.data;
  const srcRgba = new Uint8ClampedArray(srcBuffer);
  const result = processImageBuffer(srcRgba, srcW, srcH, settings, palette, charRamp);

  const codepointsBuf = result.codepoints.buffer as ArrayBuffer;
  const fgBuf = result.fgRgba.buffer as ArrayBuffer;
  const bgBuf = result.bgRgba.buffer as ArrayBuffer;

  const response: WorkerRenderResponse = {
    jobId,
    cols: result.cols,
    rows: result.rows,
    mode: result.mode,
    codepoints: codepointsBuf,
    fgRgba: fgBuf,
    bgRgba: bgBuf,
    renderTimeMs: result.renderTimeMs,
  };

  self.postMessage(response, {
    transfer: [codepointsBuf, fgBuf, bgBuf],
  });
};

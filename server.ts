import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

const VALID_MODES = new Set(['pixel', 'ascii', 'halfblock', 'braille']);
const VALID_DITHERS = new Set([
  'none',
  'bayer2',
  'bayer4',
  'bayer8',
  'bayer16',
  'stochastic',
  'floyd-steinberg',
  'atkinson',
  'stucki',
]);
const VALID_COLOR_MODES = new Set(['mono', 'grayscale', 'palette', 'truecolor']);

function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clampFloat(val: unknown, min: number, max: number, fallback: number): number {
  const n = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n * 100) / 100));
}

function sanitizeHex(val: unknown, fallback: string): string {
  if (typeof val !== 'string') return fallback;
  const trimmed = val.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(trimmed) ? trimmed.toUpperCase() : fallback;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.post('/api/style-assistant', async (req, res) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error: 'Gemini API key is not configured. Using offline auto-tune instead.',
        code: 'API_KEY_MISSING',
      });
      return;
    }

    try {
      const {
        imageBase64,
        goalPrompt,
        availablePalettes = [],
        availableRamps = [],
      } = req.body ?? {};

      const paletteList = Array.isArray(availablePalettes)
        ? availablePalettes
            .map((p: { id?: string; name?: string; colorCount?: number }) =>
              `${p.id} ("${p.name}", ${p.colorCount ?? 4} colors)`
            )
            .join(', ')
        : '';

      const rampList = Array.isArray(availableRamps)
        ? availableRamps
            .map((r: { id?: string; name?: string }) => `${r.id} ("${r.name}")`)
            .join(', ')
        : '';

      const userGoal =
        typeof goalPrompt === 'string' && goalPrompt.trim().length > 0
          ? goalPrompt.trim()
          : 'Auto-tune this image for the clearest, most visually balanced pixel/ASCII dithering, tone, and color.';

      const systemInstruction = `You are a digital art & retro image-processing director for PhosphorGrid.
Your job is to make dithering, tone, simplification, and color selection effortless for non-technical users.
Analyze the supplied image (its lighting, contrast, subject detail, and color richness) together with the user's plain-English request, and choose the ideal render parameters.

Guide for choosing algorithms & settings:
- 'atkinson': Crisp, punchy, preserves highlights/shadows cleanly; great for portraits, ink/newspaper prints, 1-bit sketches, and classic Macintosh aesthetics.
- 'floyd-steinberg' or 'stucki': Smooth photographic gradients and natural skin/sky transitions.
- 'bayer4' or 'bayer8': Structured crosshatch retro computer/Game Boy/console look; great for pixel art and shaded Unicode blocks.
- 'bayer2' or 'bayer16': Coarse graphic grid (2x2) or subtle fine ordered print (16x16).
- 'none': Clean flat posterized look when user wants bold stencil/vector simplification without grain.
- Render modes:
  - 'ascii': Classic terminal character art (use charRampId).
  - 'pixel': Square retro pixel blocks.
  - 'halfblock': Double-vertical-resolution color pixel art using half-blocks.
  - 'braille': Ultra-fine dot-matrix sketch using Unicode Braille.
- Keep 'summary' to 1 friendly, plain-English sentence (under 25 words) explaining what look was applied and why, avoiding dense math jargon.
- Choose paletteId strictly from: [${paletteList}]
- Choose charRampId strictly from: [${rampList}]`;

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const parts: Array<
        { inlineData: { mimeType: string; data: string } } | { text: string }
      > = [];

      if (typeof imageBase64 === 'string' && imageBase64.length > 0) {
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageBase64,
          },
        });
      }

      parts.push({
        text: `User request: "${userGoal}"\nReturn the best configuration JSON.`,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summary: {
                type: Type.STRING,
                description: 'A friendly 1-sentence plain-English explanation of the chosen look.',
              },
              mode: {
                type: Type.STRING,
                description: 'One of: pixel, ascii, halfblock, braille',
              },
              ditherAlgorithm: {
                type: Type.STRING,
                description:
                  'One of: none, bayer2, bayer4, bayer8, bayer16, stochastic, floyd-steinberg, atkinson, stucki',
              },
              ditherStrength: { type: Type.INTEGER },
              colorMode: {
                type: Type.STRING,
                description: 'One of: mono, grayscale, palette, truecolor',
              },
              paletteId: { type: Type.STRING },
              charRampId: { type: Type.STRING },
              monoForeground: { type: Type.STRING },
              backgroundColor: { type: Type.STRING },
              inverse: { type: Type.BOOLEAN },
              brightness: { type: Type.INTEGER },
              contrast: { type: Type.INTEGER },
              gamma: { type: Type.NUMBER },
              blurRadius: { type: Type.INTEGER },
              posterizeLevels: { type: Type.INTEGER },
              edgeBoost: { type: Type.INTEGER },
              columns: { type: Type.INTEGER },
              crtOverlay: { type: Type.BOOLEAN },
            },
            required: [
              'summary',
              'mode',
              'ditherAlgorithm',
              'ditherStrength',
              'colorMode',
              'inverse',
              'brightness',
              'contrast',
              'gamma',
            ],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as Record<string, unknown>;

      const paletteIds = new Set(
        Array.isArray(availablePalettes)
          ? availablePalettes.map((p: { id?: string }) => String(p.id))
          : []
      );
      const rampIds = new Set(
        Array.isArray(availableRamps)
          ? availableRamps.map((r: { id?: string }) => String(r.id))
          : []
      );

      const safePaletteId =
        typeof parsed.paletteId === 'string' && paletteIds.has(parsed.paletteId)
          ? parsed.paletteId
          : undefined;
      const safeRampId =
        typeof parsed.charRampId === 'string' && rampIds.has(parsed.charRampId)
          ? parsed.charRampId
          : undefined;

      const recommendation = {
        summary:
          typeof parsed.summary === 'string' && parsed.summary.trim()
            ? parsed.summary.trim()
            : 'Tuned dithering, contrast, and color balance to match your image.',
        settings: {
          mode: VALID_MODES.has(String(parsed.mode)) ? parsed.mode : 'ascii',
          ditherAlgorithm: VALID_DITHERS.has(String(parsed.ditherAlgorithm))
            ? parsed.ditherAlgorithm
            : 'bayer8',
          ditherStrength: clampInt(parsed.ditherStrength, 0, 100, 70),
          colorMode: VALID_COLOR_MODES.has(String(parsed.colorMode))
            ? parsed.colorMode
            : 'mono',
          ...(safePaletteId ? { paletteId: safePaletteId } : {}),
          ...(safeRampId ? { charRampId: safeRampId } : {}),
          monoForeground: sanitizeHex(parsed.monoForeground, '#33FF66'),
          backgroundColor: sanitizeHex(parsed.backgroundColor, '#050806'),
          inverse: Boolean(parsed.inverse),
          brightness: clampInt(parsed.brightness, -60, 60, 0),
          contrast: clampInt(parsed.contrast, -60, 65, 12),
          gamma: clampFloat(parsed.gamma, 0.4, 2.2, 1.0),
          blurRadius: clampInt(parsed.blurRadius, 0, 4, 0),
          posterizeLevels: clampInt(parsed.posterizeLevels, 0, 24, 0),
          edgeBoost: clampInt(parsed.edgeBoost, 0, 80, 15),
          columns: clampInt(parsed.columns, 40, 220, 104),
          autoFit: false,
          nativeOneToOne: false,
          crtOverlay: typeof parsed.crtOverlay === 'boolean' ? parsed.crtOverlay : false,
        },
      };

      res.json(recommendation);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze image style.';
      res.status(500).json({
        error: message,
        code: 'GEMINI_ERROR',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PhosphorGrid server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

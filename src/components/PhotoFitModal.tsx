import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, RotateCw, Upload, X, ZoomIn, ZoomOut } from 'lucide-react';

interface PhotoFitModalProps {
  file: File;
  title?: string;
  onCancel: () => void;
  onConfirm: (croppedBlob: Blob, previewDataUrl: string) => void;
}

// Exact 5:6 passport/certificate portrait dimensions (matches certificate frame & PDF box)
const OUTPUT_WIDTH = 600;
const OUTPUT_HEIGHT = 720;
const PREVIEW_WIDTH = 260;
const PREVIEW_HEIGHT = 312;

export function PhotoFitModal({
  file,
  title = 'Adjust Graduate Photo Fit',
  onCancel,
  onConfirm,
}: PhotoFitModalProps) {
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270
  const [scale, setScale] = useState<number>(1);
  const [minScale, setMinScale] = useState<number>(0.2);
  const [maxScale, setMaxScale] = useState<number>(3);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [fitMode, setFitMode] = useState<'cover' | 'contain'>('cover');
  const [exporting, setExporting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const getEffectiveSize = (img: HTMLImageElement, rot: number) => {
    const swapped = rot % 180 !== 0;
    return {
      w: swapped ? img.naturalHeight : img.naturalWidth,
      h: swapped ? img.naturalWidth : img.naturalHeight,
    };
  };

  const applyPreset = (
    img: HTMLImageElement,
    rot: number,
    mode: 'cover' | 'contain'
  ) => {
    const { w, h } = getEffectiveSize(img, rot);
    const coverScale = Math.max(PREVIEW_WIDTH / w, PREVIEW_HEIGHT / h);
    const containScale = Math.min(PREVIEW_WIDTH / w, PREVIEW_HEIGHT / h);

    setMinScale(Math.max(0.05, containScale * 0.75));
    setMaxScale(Math.max(coverScale * 3.5, 2.5));
    setFitMode(mode);

    if (mode === 'contain') {
      setScale(containScale);
      setOffset({ x: 0, y: 0 });
    } else {
      setScale(coverScale);
      // Strong upper bias when image is taller than frame so head/face stay fully visible
      const drawnH = h * coverScale;
      const overflowY = Math.max(0, (drawnH - PREVIEW_HEIGHT) / 2);
      setOffset({ x: 0, y: overflowY * 0.75 });
    }
  };

  useEffect(() => {
    const objUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth < 60 || img.naturalHeight < 60) {
        setLoadError('Image is too small. Please select a clearer photo (at least 100×100 px).');
        return;
      }
      setImgEl(img);
      const isWideLandscape = img.naturalWidth > img.naturalHeight * 1.2;
      applyPreset(img, 0, isWideLandscape ? 'contain' : 'cover');
    };
    img.onerror = () => {
      setLoadError('Unable to open this image file. Please select a JPG, PNG, or WebP photo.');
    };
    img.src = objUrl;

    return () => {
      URL.revokeObjectURL(objUrl);
    };
  }, [file]);

  // Draw live preview onto canvas whenever transform changes
  useEffect(() => {
    if (!imgEl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = PREVIEW_WIDTH * dpr;
    canvas.height = PREVIEW_HEIGHT * dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

    ctx.translate(PREVIEW_WIDTH / 2 + offset.x, PREVIEW_HEIGHT / 2 + offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(imgEl, -imgEl.naturalWidth / 2, -imgEl.naturalHeight / 2);
    ctx.restore();
  }, [imgEl, rotation, scale, offset]);

  const handleRotate = () => {
    if (!imgEl) return;
    const nextRot = (rotation + 90) % 360;
    setRotation(nextRot);
    applyPreset(imgEl, nextRot, fitMode);
  };

  const handleConfirm = async () => {
    if (!imgEl) return;
    setExporting(true);
    try {
      const outCanvas = document.createElement('canvas');
      outCanvas.width = OUTPUT_WIDTH;
      outCanvas.height = OUTPUT_HEIGHT;
      const ctx = outCanvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');

      const ratio = OUTPUT_WIDTH / PREVIEW_WIDTH;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT);

      ctx.save();
      ctx.translate(
        OUTPUT_WIDTH / 2 + offset.x * ratio,
        OUTPUT_HEIGHT / 2 + offset.y * ratio
      );
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(scale * ratio, scale * ratio);
      ctx.drawImage(imgEl, -imgEl.naturalWidth / 2, -imgEl.naturalHeight / 2);
      ctx.restore();

      const previewDataUrl = outCanvas.toDataURL('image/jpeg', 0.9);
      const blob = await new Promise<Blob>((resolve, reject) => {
        outCanvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Could not process image.'))),
          'image/jpeg',
          0.92
        );
      });
      onConfirm(blob, previewDataUrl);
    } catch {
      setLoadError('Failed to process image. Please try another photo.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Drag the photo or adjust zoom so the face fits clearly inside the certificate frame.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
            aria-label="Close photo editor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loadError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              {loadError}
            </div>
          ) : (
            <>
              {/* Live 5:6 Certificate Frame Preview */}
              <div className="flex flex-col items-center">
                <div
                  className="relative rounded-lg p-1 bg-white border-2 border-[#1D3557] ring-2 ring-[#E6A800]/75 shadow-md select-none touch-none"
                  style={{ width: PREVIEW_WIDTH + 12, height: PREVIEW_HEIGHT + 12 }}
                >
                  <canvas
                    ref={canvasRef}
                    style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }}
                    className="block rounded bg-slate-50 cursor-grab active:cursor-grabbing"
                    onPointerDown={(e) => {
                      (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
                      dragRef.current = {
                        dragging: true,
                        startX: e.clientX,
                        startY: e.clientY,
                        origX: offset.x,
                        origY: offset.y,
                      };
                    }}
                    onPointerMove={(e) => {
                      if (!dragRef.current.dragging) return;
                      setOffset({
                        x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
                        y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
                      });
                    }}
                    onPointerUp={() => {
                      dragRef.current.dragging = false;
                    }}
                    onPointerCancel={() => {
                      dragRef.current.dragging = false;
                    }}
                  />
                  {/* Subtle rule-of-thirds / face zone guide */}
                  <div className="pointer-events-none absolute inset-3 border border-dashed border-slate-900/15 rounded" />
                </div>
                <span className="text-[11px] text-slate-500 mt-2">
                  Drag image inside frame to adjust position
                </span>
              </div>

              {/* Fit Mode & Rotate Presets */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => imgEl && applyPreset(imgEl, rotation, 'cover')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer ${
                    fitMode === 'cover'
                      ? 'bg-[#1D3557] text-white border-[#1D3557]'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  Fill Frame (Passport)
                </button>
                <button
                  type="button"
                  onClick={() => imgEl && applyPreset(imgEl, rotation, 'contain')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer ${
                    fitMode === 'contain'
                      ? 'bg-[#1D3557] text-white border-[#1D3557]'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  Fit Whole Photo
                </button>
                <button
                  type="button"
                  onClick={handleRotate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  Rotate 90°
                </button>
              </div>

              {/* Zoom Slider */}
              <div className="flex items-center gap-3 px-1">
                <button
                  type="button"
                  onClick={() => setScale((s) => Math.max(minScale, s * 0.9))}
                  className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <input
                  type="range"
                  min={minScale}
                  max={maxScale}
                  step={0.01}
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                  className="w-full accent-[#1D3557] cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => setScale((s) => Math.min(maxScale, s * 1.1))}
                  className="p-1 text-slate-500 hover:text-slate-900 cursor-pointer"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer"
          >
            Cancel
          </button>
          {!loadError && (
            <button
              type="button"
              disabled={!imgEl || exporting}
              onClick={handleConfirm}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              {exporting ? 'Saving...' : 'Save & Apply Photo'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

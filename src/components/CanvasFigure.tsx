import { memo, useEffect, useRef } from 'react';
import { drawArrayToCanvas, type ColorMapMode } from '../dsp/colormap';

interface CanvasFigureProps {
  title: string;
  note?: string;
  data: Float64Array;
  width: number;
  height: number;
  mode?: ColorMapMode;
  autoScale?: boolean;
}

export const CanvasFigure = memo(function CanvasFigure({
  title,
  note,
  data,
  width,
  height,
  mode = 'gray',
  autoScale = false,
}: CanvasFigureProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawArrayToCanvas(canvas, data, width, height, mode, autoScale);
  }, [data, width, height, mode, autoScale]);

  return (
    <figure className="figure-card" style={{ margin: 0 }}>
      <figcaption className="figure-caption">
        <span>{title}</span>
        {note ? <span className="figure-note">{note}</span> : null}
      </figcaption>
      <div className="canvas-frame" style={{ aspectRatio: `${width} / ${height}` }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="display-canvas"
          role="img"
          aria-label={`${title} (${width} x ${height} piksel)`}
        />
      </div>
    </figure>
  );
});

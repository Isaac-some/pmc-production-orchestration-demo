/*
MIT License

Copyright (c) 2026 Klyv contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
// Adapted from the user-supplied Klyv reference to the existing CSS and XYFlow stack.
import React, {
  useEffect,
  useId,
  useState,
  type RefObject,
  type CSSProperties,
} from "react";
import "./animated-beam.css";

export function BeamPath({
  d,
  paused = false,
  duration = 2.6,
  delay = 0,
  beamColor = "#477eaf",
}: {
  d: string;
  paused?: boolean;
  duration?: number;
  delay?: number;
  beamColor?: string;
}) {
  const id = useId().replace(/:/g, "");
  if (paused) return null;
  return (
    <>
      <defs>
        <linearGradient id={`beam-${id}`}>
          <stop offset="0%" stopColor={beamColor} stopOpacity="0.15" />
          <stop offset="50%" stopColor={beamColor} />
          <stop offset="100%" stopColor={beamColor} stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <path
        className="klyv-beam-pulse"
        d={d}
        fill="none"
        stroke={`url(#beam-${id})`}
        strokeWidth={2.5}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="12 100"
        style={
          {
            "--beam-travel": -112,
            animationDuration: `${duration}s`,
            animationDelay: `${delay}s`,
          } as CSSProperties
        }
      />
    </>
  );
}

export function AnimatedBeam({
  containerRef,
  fromRef,
  toRef,
  curvature = 18,
  paused = false,
  delay = 0,
}: {
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  curvature?: number;
  paused?: boolean;
  delay?: number;
}) {
  const [geometry, setGeometry] = useState<{
    width: number;
    height: number;
    d: string;
  }>();
  useEffect(() => {
    const container = containerRef.current,
      from = fromRef.current,
      to = toRef.current;
    if (!container || !from || !to) return;
    const measure = () => {
      const box = container.getBoundingClientRect();
      if (!box.width || !box.height) return;
      // Convert screen geometry back to local coordinates: the canvas may be zoomed.
      const sx = container.offsetWidth / box.width,
        sy = container.offsetHeight / box.height;
      const centre = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        return {
          x: (r.left - box.left + r.width / 2) * sx - container.clientLeft,
          y: (r.top - box.top + r.height / 2) * sy - container.clientTop,
        };
      };
      const start = centre(from),
        end = centre(to),
        dx = end.x - start.x,
        dy = end.y - start.y,
        span = Math.hypot(dx, dy) || 1;
      const cx = (start.x + end.x) / 2 - (dy / span) * curvature,
        cy = (start.y + end.y) / 2 + (dx / span) * curvature;
      setGeometry({
        width: container.clientWidth,
        height: container.clientHeight,
        d: `M ${start.x},${start.y} Q ${cx},${cy} ${end.x},${end.y}`,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    [container, from, to].forEach((el) => observer.observe(el));
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [containerRef, fromRef, toRef, curvature]);
  if (!geometry) return null;
  return (
    <svg
      aria-hidden="true"
      className="klyv-beam"
      width={geometry.width}
      height={geometry.height}
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
    >
      <path d={geometry.d} fill="none" stroke="#bdcbd6" strokeWidth={1.5} />
      <BeamPath d={geometry.d} paused={paused} delay={delay} />
    </svg>
  );
}

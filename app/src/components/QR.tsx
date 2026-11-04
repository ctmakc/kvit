import qrcode from "qrcode-generator";
import { useMemo } from "react";

/** SVG QR whose modules sweep in diagonally (CSS var --d per module). */
export function QR({ value, size = 220, label }: { value: string; size?: number; label: string }) {
  const { n, cells } = useMemo(() => {
    const q = qrcode(0, "M");
    q.addData(value);
    q.make();
    const n = q.getModuleCount();
    const cells: { x: number; y: number }[] = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) cells.push({ x, y });
    return { n, cells };
  }, [value]);
  const pad = 2;
  return (
    <svg
      className="qr"
      key={value}
      role="img"
      aria-label={label}
      viewBox={`${-pad} ${-pad} ${n + pad * 2} ${n + pad * 2}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
    >
      <rect x={-pad} y={-pad} width={n + pad * 2} height={n + pad * 2} className="qr-bg" />
      {cells.map((c) => (
        <rect
          key={c.x + "_" + c.y}
          x={c.x}
          y={c.y}
          width={1.02}
          height={1.02}
          style={{ ["--d" as any]: `${((c.x + c.y) / (2 * n)) * 520}ms` }}
        />
      ))}
    </svg>
  );
}

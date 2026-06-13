import { Card } from "@/components/ui/card";
import type { WeekBucket } from "@/server/cockpit/overview-summary";

export function MomentumChart({ buckets }: { buckets: WeekBucket[] }) {
  const total = buckets.reduce((n, b) => n + b.count, 0);
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const W = 560;
  const H = 140;
  const P = 8;
  const innerW = W - P * 2;
  const innerH = H - P * 2;
  const stepX = buckets.length > 1 ? innerW / (buckets.length - 1) : 0;
  const xy = (b: WeekBucket, i: number): readonly [number, number] => [
    P + i * stepX,
    P + innerH - (b.count / max) * innerH,
  ];
  const line = buckets
    .map((b, i) => {
      const [x, y] = xy(b, i);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const lastX = (P + (buckets.length - 1) * stepX).toFixed(1);
  const area = `${line} L${lastX},${(H - P).toFixed(1)} L${P.toFixed(1)},${(H - P).toFixed(1)} Z`;

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Delivery momentum</h2>
          <p className="text-xs text-muted-foreground">Ship updates published · last {buckets.length} weeks</p>
        </div>
        <span className="font-mono text-2xl font-semibold text-foreground">{total}</span>
      </div>
      {total === 0 ? (
        <div className="flex h-[140px] items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
          No updates published yet — your momentum chart fills in as you ship.
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${total} ship updates over ${buckets.length} weeks`}>
          <defs>
            <linearGradient id="momentum-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#momentum-fill)" />
          <path d={line} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
    </Card>
  );
}

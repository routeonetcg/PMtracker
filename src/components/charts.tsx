"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMonth } from "@/lib/dates";
import { formatUSD } from "@/lib/money";

const axis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false } as const;

function compactUSD(cents: number) {
  const d = cents / 100; // display only
  const abs = Math.abs(d);
  if (abs >= 1000) return `${d < 0 ? "-" : ""}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `${d < 0 ? "-" : ""}$${Math.round(abs)}`;
}

type TipPayload = { name?: string; value?: number; color?: string; dataKey?: string | number };

function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
}: {
  active?: boolean;
  payload?: TipPayload[];
  label?: string;
  labelFormatter?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-foreground">{labelFormatter ? labelFormatter(String(label)) : label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center justify-between gap-4 text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="num font-medium text-foreground">{formatUSD(p.value ?? 0)}</span>
        </p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function MonthlyChart({ data }: { data: { month: string; revenueCents: number; netProfitCents: number }[] }) {
  return (
    <div>
      <Legend
        items={[
          { label: "Revenue", color: "var(--chart-2)" },
          { label: "Net profit", color: "var(--chart-1)" },
        ]}
      />
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis dataKey="month" tickFormatter={formatMonth} {...axis} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tickFormatter={compactUSD} {...axis} width={52} domain={[(min: number) => Math.min(0, min), (max: number) => (max > 0 ? max : 10000)]} />
            <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.5 }} content={<ChartTooltip labelFormatter={formatMonth} />} />
            <Bar dataKey="revenueCents" name="Revenue" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="netProfitCents" name="Net profit" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function InventoryValueChart({ data }: { data: { month: string; costCents: number; marketCents?: number | null }[] }) {
  const hasMarket = data.some((d) => d.marketCents != null);
  return (
    <div>
      {hasMarket ? (
        <Legend
          items={[
            { label: "At market", color: "var(--chart-1)" },
            { label: "At cost", color: "var(--chart-2)" },
          ]}
        />
      ) : null}
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="invFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="month" tickFormatter={formatMonth} {...axis} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tickFormatter={compactUSD} {...axis} width={52} domain={[(min: number) => Math.min(0, min), (max: number) => (max > 0 ? max : 10000)]} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              content={<ChartTooltip labelFormatter={formatMonth} />}
            />
            <Area
              type="linear"
              dataKey="costCents"
              name="At cost"
              stroke="var(--chart-2)"
              strokeWidth={2}
              fill="url(#invFill)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }}
            />
            {hasMarket ? (
              <Area
                type="linear"
                dataKey="marketCents"
                name="At market"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="none"
                dot={false}
                connectNulls
                activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)" }}
              />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ChannelChart({ data }: { data: { label: string; profitCents: number; revenueCents: number }[] }) {
  return (
    <div style={{ height: Math.max(120, data.length * 44 + 16) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64, left: 0, bottom: 0 }} barCategoryGap={10}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" {...axis} width={84} tick={{ fill: "var(--foreground)", fontSize: 12 }} />
          <Tooltip cursor={{ fill: "var(--accent)", opacity: 0.5 }} content={<ChartTooltip />} />
          <Bar dataKey="profitCents" name="Profit" radius={4} maxBarSize={22}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.profitCents >= 0 ? "var(--profit)" : "var(--loss)"} />
            ))}
            <LabelList
              dataKey="profitCents"
              position="right"
              formatter={(v: unknown) => formatUSD(Number(v), { whole: true })}
              style={{ fill: "var(--foreground)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

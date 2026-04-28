"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

type Props = {
  data: { date: string; close: number }[];
};

export function PriceChart({ data }: Props) {
  return (
    <div className="w-full h-64">
      <ResponsiveContainer>
        <LineChart data={data}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => v.slice(5)}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            domain={["auto", "auto"]}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip
            formatter={(v: number) => [`$${v.toFixed(2)}`, "收盤"]}
            contentStyle={{ fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="close"
            stroke="#2563eb"
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

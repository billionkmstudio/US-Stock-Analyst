"use client";

import ExpertPanel from "@/components/ExpertPanel";

interface ExpertSectionProps {
  symbol: string;
}

export default function ExpertSection({ symbol }: ExpertSectionProps) {
  return (
    <section>
      <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-200 mb-4 flex items-center gap-2">
        <span>🧠</span>
        <span>專家策略模擬器</span>
      </h2>
      <ExpertPanel symbol={symbol} />
    </section>
  );
}

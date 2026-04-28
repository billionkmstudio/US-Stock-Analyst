"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export function AddStockForm() {
  const [symbol, setSymbol] = useState("");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol) return;

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("watchlist").insert({
      user_id: user.id,
      symbol: symbol.toUpperCase().trim(),
      note: note || null,
    });

    if (!error) {
      setSymbol("");
      setNote("");
      startTransition(() => router.refresh());
    } else {
      alert(error.message);
    }
  }

  return (
    <form onSubmit={handleAdd} className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 flex gap-2 flex-wrap">
      <input
        type="text"
        placeholder="代號(如 GOOG)"
        value={symbol}
        onChange={(e) => setSymbol(e.target.value)}
        className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 w-32"
      />
      <input
        type="text"
        placeholder="備註(可選)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
      />
      <button
        type="submit"
        disabled={isPending}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium disabled:opacity-50"
      >
        {isPending ? "加入中..." : "加入"}
      </button>
    </form>
  );
}

import { useEffect, useState } from "react";
import { toast, type ToastLevel } from "../../lib/toast";

type ToastItem = { id: number; message: string; level: ToastLevel };

const DISMISS_AFTER_MS = 4500;

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    toast._register((message, level, id) => {
      setItems((prev) => [...prev, { id, message, level }]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== id));
      }, DISMISS_AFTER_MS);
    });
    return () => toast._unregister();
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
          className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg transition-opacity max-w-sm ${
            item.level === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : item.level === "error"
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-zinc-200 bg-white text-zinc-800"
          }`}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}

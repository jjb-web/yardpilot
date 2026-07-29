import { Check } from "lucide-react";

export default function CopyToast({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[120] -translate-x-1/2 rounded-full border border-emerald-200 bg-emerald-950 px-4 py-2.5 text-sm font-semibold text-white shadow-xl">
      <span className="flex items-center gap-2">
        <Check size={15} className="text-emerald-300" />
        {message}
      </span>
    </div>
  );
}

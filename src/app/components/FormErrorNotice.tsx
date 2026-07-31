import { AlertCircle } from "lucide-react";

type FormErrorNoticeProps = {
  message: string;
  position?: "inline" | "floating";
};

export default function FormErrorNotice({
  message,
  position = "inline",
}: FormErrorNoticeProps) {
  if (!message) return null;

  if (position === "floating") {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="fixed left-1/2 top-4 z-[120] flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-start gap-3 rounded-xl border border-red-300 bg-white px-4 py-3 text-sm text-red-800 shadow-lg"
      >
        <AlertCircle size={18} className="mt-0.5 shrink-0" />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
    >
      <AlertCircle size={17} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

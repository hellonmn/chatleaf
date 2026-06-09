"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

export function SubmitButton({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center gap-1.5 rounded-btn bg-brand px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(14,116,144,.22)] transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

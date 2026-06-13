"use client";

/**
 * Submit button that guards a (usually destructive) form action with a browser
 * confirm — or, when `confirmText` is given, a typed-match prompt (e.g. type the
 * org name to delete it). Cancelling prevents submission.
 */
export function ConfirmSubmit({
  children,
  message,
  confirmText,
  className = "",
}: {
  children: React.ReactNode;
  message: string;
  confirmText?: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (confirmText) {
          const answer = window.prompt(message);
          if (answer !== confirmText) e.preventDefault();
        } else if (!window.confirm(message)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}

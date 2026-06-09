import { Wordmark } from "@/components/Wordmark";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Wordmark size={32} />
          <p className="mt-2 text-sm text-sub">
            Conversations that grow your business.
          </p>
        </div>
        <div className="rounded-card border border-line bg-white p-6 shadow-card">
          {children}
        </div>
      </div>
    </div>
  );
}

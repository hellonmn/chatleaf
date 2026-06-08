export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 text-2xl font-bold text-brand-ink">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-white">
              W
            </span>
            Watool
          </div>
          <p className="mt-1 text-sm text-slate-500">
            WhatsApp chatbots for your business
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}

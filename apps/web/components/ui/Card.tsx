import Link from "next/link";

/** Chatleaf card — 18px radius, ocean-tinted soft shadow, white panel. */
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-card border border-line bg-white shadow-card ${className}`}>
      {children}
    </div>
  );
}

/** Card with a title row and an optional "action →" link, per the mockup. */
export function SectionCard({
  title,
  action,
  children,
  className = "",
  bodyClassName = "p-5",
}: {
  title: string;
  action?: { label: string; href: string };
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={className}>
      <div className="flex items-center justify-between px-5 pt-5">
        <h3 className="text-base font-bold text-ink">{title}</h3>
        {action && (
          <Link
            href={action.href}
            className="text-sm font-semibold text-brand hover:text-brand-dark"
          >
            {action.label} →
          </Link>
        )}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Server-rendered offset pagination. Builds page links that preserve the other
 * query params (search/filters). Renders nothing when there's a single page.
 */
export function Pagination({
  page,
  totalPages,
  total,
  basePath,
  params,
}: {
  page: number;
  totalPages: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  if (totalPages <= 1) {
    return total > 0 ? (
      <p className="text-center text-xs text-faint">{total.toLocaleString()} total</p>
    ) : null;
  }

  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };

  const linkCls =
    "inline-flex items-center gap-1 rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-sub hover:bg-canvas";
  const disabledCls =
    "inline-flex items-center gap-1 rounded-btn border border-line px-3 py-1.5 text-sm font-semibold text-faint opacity-50 cursor-default";

  return (
    <div className="flex items-center justify-between gap-3">
      {page > 1 ? (
        <Link href={href(page - 1)} className={linkCls}>
          <ChevronLeft className="h-4 w-4" /> Prev
        </Link>
      ) : (
        <span className={disabledCls}>
          <ChevronLeft className="h-4 w-4" /> Prev
        </span>
      )}

      <span className="text-sm text-sub">
        Page <strong className="text-ink">{page}</strong> of {totalPages}
        <span className="ml-2 text-xs text-faint">({total.toLocaleString()} total)</span>
      </span>

      {page < totalPages ? (
        <Link href={href(page + 1)} className={linkCls}>
          Next <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span className={disabledCls}>
          Next <ChevronRight className="h-4 w-4" />
        </span>
      )}
    </div>
  );
}

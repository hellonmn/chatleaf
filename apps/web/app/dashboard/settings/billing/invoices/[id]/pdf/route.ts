import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@watool/db";
import { requireActiveContext } from "@/lib/session";
import { getPlatformSettings } from "@/lib/platform-settings";

export const runtime = "nodejs";

function money(paise: number) {
  return `Rs. ${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

/** Decode a data: URL into bytes + mime (for logo embedding). */
function decodeDataUrl(url: string | null): { bytes: Uint8Array; mime: string } | null {
  if (!url) return null;
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(url);
  if (!m) return null;
  return { mime: m[1]!.toLowerCase(), bytes: Buffer.from(m[2]!, "base64") };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireActiveContext();
  const { id } = await params;
  const inv = await prisma.invoice.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!inv) return new Response("Not found", { status: 404 });
  const settings = await getPlatformSettings();

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.12, 0.16);
  const sub = rgb(0.42, 0.45, 0.5);
  const line = rgb(0.85, 0.87, 0.9);
  const M = 50;
  const W = 595.28;
  let y = 841.89 - M;

  const text = (s: string, x: number, yy: number, size = 10, f = font, color = ink) =>
    page.drawText(s, { x, y: yy, size, font: f, color });
  const right = (s: string, xRight: number, yy: number, size = 10, f = font, color = ink) =>
    page.drawText(s, { x: xRight - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color });
  const hr = (yy: number) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: 0.7, color: line });

  // ── Header: logo + seller (left), invoice meta (right) ──
  const logo = decodeDataUrl(settings.logoUrl);
  let headerLeftY = y;
  let logoShown = false;
  if (logo) {
    try {
      const img = logo.mime.includes("png")
        ? await doc.embedPng(logo.bytes)
        : logo.mime.includes("jpeg") || logo.mime.includes("jpg")
          ? await doc.embedJpg(logo.bytes)
          : null;
      if (img) {
        const h = 40;
        const w = (img.width / img.height) * h;
        page.drawImage(img, { x: M, y: y - h, width: w, height: h });
        headerLeftY = y - h - 14;
        logoShown = true;
      }
    } catch {
      /* unsupported image — skip */
    }
  }
  // Logo already carries the brand — only print the company name when there's no logo.
  let ly = headerLeftY;
  if (!logoShown) {
    text(settings.companyName || settings.brandName, M, headerLeftY, 14, bold);
    ly = headerLeftY - 14;
  }
  if (settings.companyAddress) {
    for (const ln of settings.companyAddress.split("\n").slice(0, 3)) {
      text(ln, M, ly, 9, font, sub);
      ly -= 12;
    }
  }
  if (inv.sellerGstin) {
    text(`GSTIN: ${inv.sellerGstin}`, M, ly, 9, font, sub);
    ly -= 12;
  }

  right("TAX INVOICE", W - M, y, 12, bold, sub);
  right(inv.number, W - M, y - 16, 11, bold);
  right(inv.issuedAt.toLocaleDateString("en-IN"), W - M, y - 30, 9, font, sub);

  y = Math.min(ly, y - 44) - 10;
  hr(y);
  y -= 22;

  // ── Billed to ──
  text("BILLED TO", M, y, 8, bold, sub);
  y -= 14;
  text(inv.buyerName, M, y, 11, bold);
  if (inv.buyerGstin) {
    y -= 13;
    text(`GSTIN: ${inv.buyerGstin}`, M, y, 9, font, sub);
  }
  y -= 28;

  // ── Line item table ──
  text("DESCRIPTION", M, y, 8, bold, sub);
  right("AMOUNT", W - M, y, 8, bold, sub);
  y -= 8;
  hr(y);
  y -= 18;
  text(inv.description, M, y, 10);
  right(money(inv.subtotal), W - M, y, 10);
  y -= 14;
  hr(y);
  y -= 22;

  // ── Totals (right column) ──
  const labelX = W - M - 230;
  const drawTotal = (label: string, val: string, b = false) => {
    text(label, labelX, y, 10, b ? bold : font, b ? ink : sub);
    right(val, W - M, y, 10, b ? bold : font);
    y -= 16;
  };
  drawTotal("Taxable value", money(inv.subtotal));
  if (inv.igst > 0) {
    drawTotal(`IGST @${inv.gstPercent}%`, money(inv.igst));
  } else {
    drawTotal(`CGST @${inv.gstPercent / 2}%`, money(inv.cgst));
    drawTotal(`SGST @${inv.gstPercent / 2}%`, money(inv.sgst));
  }
  y -= 4;
  page.drawLine({ start: { x: labelX, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 0.7, color: line });
  drawTotal("Total", money(inv.total), true);

  text("This is a computer-generated invoice.", M, M, 8, font, sub);

  const bytes = await doc.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${inv.number}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}

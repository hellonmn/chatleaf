/**
 * The real WhatsApp logo (served from /public/channels/whatsapp.png). Use this
 * anywhere we represent the WhatsApp brand instead of a generic lucide icon.
 * Plain <img> so it works in both server and client components.
 */
export function WaIcon({ className = "h-4 w-4" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/channels/whatsapp.png" alt="WhatsApp" className={`object-contain ${className}`} />;
}

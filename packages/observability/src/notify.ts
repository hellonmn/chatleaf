import { logger } from "./logger";

/**
 * Operator alerts — fan out to whichever channels are configured (both is fine):
 *   - Slack:  SLACK_ALERT_WEBHOOK   (an Incoming Webhook URL)
 *   - Email:  RESEND_API_KEY + ALERT_EMAIL_FROM + ALERT_EMAIL_TO (comma-sep)
 * Both use plain fetch (no SDKs). Always logs, regardless of channels. Failures
 * are swallowed (an alert must never break the action that triggered it).
 */
export type AlertLevel = "info" | "warning" | "critical";

export type Alert = {
  title: string;
  message: string;
  level?: AlertLevel;
  fields?: Record<string, string | number>;
};

export async function notify(alert: Alert): Promise<void> {
  const level = alert.level ?? "info";
  logger.info(`alert: ${alert.title}`, { alertLevel: level, message: alert.message, ...alert.fields });
  await Promise.allSettled([sendSlack(alert, level), sendEmail(alert, level)]);
}

async function sendSlack(alert: Alert, level: AlertLevel): Promise<void> {
  const url = process.env.SLACK_ALERT_WEBHOOK;
  if (!url) return;
  const emoji = level === "critical" ? "🔴" : level === "warning" ? "🟠" : "🔵";
  const extra = alert.fields
    ? "\n" + Object.entries(alert.fields).map(([k, v]) => `• *${k}:* ${v}`).join("\n")
    : "";
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `${emoji} *${alert.title}*\n${alert.message}${extra}` }),
    });
  } catch (err) {
    logger.warn("slack alert failed", { err: err instanceof Error ? err.message : String(err) });
  }
}

async function sendEmail(alert: Alert, level: AlertLevel): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_EMAIL_FROM;
  const to = process.env.ALERT_EMAIL_TO;
  if (!key || !from || !to) return;
  const fieldsHtml = alert.fields
    ? "<ul>" + Object.entries(alert.fields).map(([k, v]) => `<li><b>${k}:</b> ${v}</li>`).join("") + "</ul>"
    : "";
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from,
        to: to.split(",").map((s) => s.trim()).filter(Boolean),
        subject: `[${level}] ${alert.title}`,
        html: `<p>${alert.message}</p>${fieldsHtml}`,
      }),
    });
  } catch (err) {
    logger.warn("email alert failed", { err: err instanceof Error ? err.message : String(err) });
  }
}

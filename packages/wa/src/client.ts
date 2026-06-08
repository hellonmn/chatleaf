/**
 * WhatsApp Cloud API client. ALL outbound messages go through here so Meta's
 * rules live in ONE place:
 *   - the 24-hour customer-service window (free-form only within 24h of the
 *     contact's last inbound message; otherwise an approved template is required)
 *   - rate-limit / transient error classification for retries
 *   - persisting the returned wa message id (caller's job, via the return value)
 */

const GRAPH = "https://graph.facebook.com";

export type WhatsAppClientConfig = {
  phoneNumberId: string;
  accessToken: string;
  /** Graph API version, e.g. "v21.0". */
  version?: string;
};

export class WindowClosedError extends Error {
  constructor() {
    super(
      "Outside the 24-hour customer-service window. Send an approved template instead.",
    );
    this.name = "WindowClosedError";
  }
}

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    readonly code: number | undefined,
    readonly httpStatus: number,
    readonly raw: unknown,
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }

  /** Meta rate-limit / transient codes worth retrying (see ARCHITECTURE §7.3). */
  get isRetryable(): boolean {
    const retryCodes = new Set([131056, 80007, 131048, 133016, 500, 503]);
    return (
      (this.code !== undefined && retryCodes.has(this.code)) ||
      this.httpStatus >= 500
    );
  }
}

export type SendResult = { waMessageId: string; raw: unknown };

export function createWhatsAppClient(config: WhatsAppClientConfig) {
  const version = config.version ?? process.env.META_GRAPH_API_VERSION ?? "v21.0";
  const endpoint = `${GRAPH}/${version}/${config.phoneNumberId}/messages`;

  async function post(body: Record<string, unknown>): Promise<SendResult> {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
    });

    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      const err = json?.error ?? {};
      throw new WhatsAppApiError(
        err.message ?? `WhatsApp API error (${res.status})`,
        err.code,
        res.status,
        json,
      );
    }
    const waMessageId = json?.messages?.[0]?.id as string | undefined;
    if (!waMessageId) {
      throw new WhatsAppApiError("No message id in response", undefined, res.status, json);
    }
    return { waMessageId, raw: json };
  }

  /** True if `now` is still inside the 24h window ending at `windowExpiresAt`. */
  function isWindowOpen(windowExpiresAt: Date | null | undefined): boolean {
    return !!windowExpiresAt && windowExpiresAt.getTime() > Date.now();
  }

  return {
    endpoint,
    isWindowOpen,

    /** Free-form text. Enforces the 24h window — throws WindowClosedError if closed. */
    async sendText(
      to: string,
      body: string,
      windowExpiresAt: Date | null | undefined,
    ): Promise<SendResult> {
      if (!isWindowOpen(windowExpiresAt)) throw new WindowClosedError();
      return post({
        to,
        type: "text",
        text: { preview_url: false, body },
      });
    },

    /** Interactive reply buttons (max 3). Free-form — window-gated. */
    async sendButtons(
      to: string,
      body: string,
      buttons: { id: string; title: string }[],
      windowExpiresAt: Date | null | undefined,
    ): Promise<SendResult> {
      if (!isWindowOpen(windowExpiresAt)) throw new WindowClosedError();
      return post({
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: body },
          action: {
            buttons: buttons.slice(0, 3).map((b) => ({
              type: "reply",
              reply: { id: b.id, title: b.title },
            })),
          },
        },
      });
    },

    /**
     * Approved template — the ONLY thing allowed outside the 24h window
     * (and required for business-initiated messages / broadcasts).
     */
    async sendTemplate(
      to: string,
      name: string,
      languageCode: string,
      components?: unknown[],
    ): Promise<SendResult> {
      return post({
        to,
        type: "template",
        template: {
          name,
          language: { code: languageCode },
          ...(components ? { components } : {}),
        },
      });
    },

    /** Mark an inbound message as read (the blue ticks). Best-effort, never throws. */
    async markRead(messageId: string): Promise<void> {
      try {
        await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            status: "read",
            message_id: messageId,
          }),
        });
      } catch {
        /* best-effort */
      }
    },
  };
}

export type WhatsAppClient = ReturnType<typeof createWhatsAppClient>;

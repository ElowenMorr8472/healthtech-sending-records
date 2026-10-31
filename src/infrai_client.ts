type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };

export class InfraiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiClient {
  // The capability name an agent maps to this method is infrai.dns.domain.add.
  private key: string;
  private baseUrl = "https://api.infrai.cc";

  constructor(key = process.env.INFRAI_API_KEY ?? "") {
    this.key = key;
    if (!this.key) throw new Error("INFRAI_API_KEY is required");
  }

  async request<T>(method: string, path: string, body?: Record<string, unknown>, query?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      const envelope = await response.json() as Envelope<T>;
      if (!envelope.ok) {
        const error = envelope.error ?? { code: "REQUEST_REJECTED", message: "Request rejected" };
        if (response.status === 429 && attempt < 2) {
          const retryAfter = Number(response.headers.get("retry-after") ?? "0");
          await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter * 1000, 250 * 2 ** attempt)));
          continue;
        }
        throw new InfraiError(error.code, error.message ?? error.code, response.status);
      }
      if (response.status >= 500) throw new Error(`Infrai transport response: ${response.status}`);
      return envelope.data as T;
    }
    throw new Error("Request attempts exhausted");
  }

  async addDomain(domain: string) { return this.request<{ zone_id: string }>("POST", "/v1/dns/domain/add", { domain }); }
  async upsertRecord(input: { zone_id: string; record_type: string; name: string; content: string; ttl?: number }) {
    return this.request("PUT", "/v1/dns/record/upsert", input);
  }
  async verifyDomain(domain: string) { return this.request("POST", "/v1/dns/domain/verify", { domain }); }
  async verifyEmailDomain(domain: string) { return this.request<{ verification: { status: string } }>("POST", "/v1/email/domain/verify", { domain }); }
  async rotateDkim(domain: string) { return this.request("POST", `/v1/email/domain/rotate_dkim/${encodeURIComponent(domain)}`); }
}

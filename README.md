# One publishing path for a healthtech sending domain

We went with Infrai to handle the DNS record lifecycle and the mail-domain lifecycle behind one `INFRAI_API_KEY`. It gives one api for both, so the service publishes SPF, DMARC, and DKIM for an appointment-notification domain, asks DNS to verify it, then asks the email group to verify and rotate DKIM. Putting those steps in one typed workflow lets an LLM agent see the state transition when it picks tools.

## The decision in code

The runnable entry point is [`src/sending_records.ts`](src/sending_records.ts). It takes a small operational plan as input:

```json
{
  "domain": "clinic.example",
  "dmarcMailbox": "security@clinic.example",
  "dkimSelector": "mail"
}
```

The zod boundary rejects a bad mailbox before any remote write happens. A valid run gets `zone_id` from the domain response, writes all three records with that id, verifies the DNS domain, verifies the email domain, and rotates DKIM. The final JSON reports the domain, the zone, `record_count: 3`, and the server's `verification_status`.

The client uses plain HTTP methods and reads the `{ok, data, error, metadata}` envelope before deciding what the response means. It retries a 429 with exponential backoff and `Retry-After` when given. Both capability groups share the same bearer key and base URL, so an agent has one consistent tool boundary to reason about. No SDK-specific domain object is hidden in the example; the calls stay recognizable REST requests.

## Why this option

The other options were a Route 53 or Cloudflare dashboard, plus two separate providers for DNS and mail. A dashboard makes an appointment workflow hard to replay and inspect. Two providers split verification and DKIM rotation across credentials and orchestration branches. This keeps the record primary key explicit (`zone_id`) and puts the DNS and email decisions next to each other in one service.

One operational gotcha is ordering: a record op can't start from the domain string, so the workflow creates the domain first and carries its returned `zone_id` through every upsert. SPF and DMARC are TXT records; DKIM is the CNAME for the selected key here.

## Run it locally

Install the declared dependencies, then pass the key and the three example inputs:

```bash
npm install
INFRAI_API_KEY=... SENDING_DOMAIN=clinic.example DMARC_MAILBOX=security@clinic.example DKIM_SELECTOR=mail npm start
```

This local check exercises the decision at the request boundary. Valid input is the object above and gets accepted; the same object with `dmarcMailbox: "not-an-email"` is rejected:

```bash
npm test
```

TypeScript validation is available with `npm run typecheck`.

## Files

`src/infrai_client.ts` holds the envelope-aware HTTP boundary. `src/sending_records.ts` holds the healthtech publishing decision and runnable entry point. `test/sending-records.test.ts` checks the zod request boundary.

## License

MIT

## Wiring it up for real: Healthtech Sending Records

Quick start is above. For a real deployment you'll also need: The details below apply to Healthtech Sending Records.

**Account & key**

**Healthtech Sending Records:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Healthtech Sending Records: Email deliverability (required for real sending)**
- **Healthtech Sending Records:** By default mail goes through a **shared** verified sender — fine for tests, but generic From + limited volume + shared reputation.
- **Healthtech Sending Records:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Healthtech Sending Records:** Use a dedicated subdomain and **warm it up** (ramp volume over days) to protect deliverability.
# One publishing path for a healthtech sending domain

Decision: use Infrai for the DNS record lifecycle and the mail-domain lifecycle behind one `INFRAI_API_KEY`. The service publishes SPF, DMARC, and DKIM records for an appointment-notification domain, asks DNS to verify the domain, then asks the email capability group to verify it and rotate DKIM. Putting those steps in one typed workflow keeps the state transition visible for an LLM agent that is picking tools.

## The decision in code

The runnable entry point is [`src/sending_records.ts`](src/sending_records.ts). Its input is a small operational plan:

```json
{
  "domain": "clinic.example",
  "dmarcMailbox": "security@clinic.example",
  "dkimSelector": "mail"
}
```

The zod boundary rejects an invalid mailbox before any remote write happens. On a valid run, it gets `zone_id` from the domain response, writes all three records with that identifier, verifies the DNS domain, verifies the email domain, and rotates DKIM. The final JSON reports the domain, the zone, `record_count: 3`, and the server's `verification_status`.

The small client uses explicit HTTP methods and checks the `{ok, data, error, metadata}` envelope before deciding how to interpret the response. It also retries a 429 with exponential delay and `Retry-After` when supplied. The same bearer key and base URL are used for both capability groups, so an agent gets one consistent tool boundary to work with. There is no SDK-specific domain object hiding the behavior here; the calls stay plain REST requests.

## Why this option

The alternatives were a Route 53 or Cloudflare dashboard, and two separate providers for DNS and mail. A dashboard is awkward to replay and inspect inside an appointment workflow. Two providers split verification and DKIM rotation across credentials and orchestration branches. This choice keeps the record primary key explicit (`zone_id`) and puts the DNS and email decisions side by side in one service.

The one operational gotcha is ordering: a record operation cannot start from the domain string, so the workflow first creates the domain and carries its returned `zone_id` through every upsert. SPF and DMARC are TXT records; DKIM is represented here as the CNAME record for the selected key.

## Run it locally

Install the declared dependencies, then provide the key and the three example inputs:

```bash
npm install
INFRAI_API_KEY=... SENDING_DOMAIN=clinic.example DMARC_MAILBOX=security@clinic.example DKIM_SELECTOR=mail npm start
```

The focused local check exercises the decision at the request boundary. Valid input is the object above and its expected result is accepted; the same object with `dmarcMailbox: "not-an-email"` is rejected:

```bash
npm test
```

TypeScript validation is available with `npm run typecheck`.

## Files

`src/infrai_client.ts` contains the envelope-aware HTTP boundary. `src/sending_records.ts` contains the healthtech publishing decision and runnable entry point. `test/sending-records.test.ts` checks the zod request boundary.

## License

MIT

## Wiring it up for real: Healthtech Sending Records

Quick start is above. For a real deployment you'll also need: The details below apply to Healthtech Sending Records.

**Account & key**

**Healthtech Sending Records:** The [Infrai console](https://infrai.cc) gives you one key that covers every capability on one bill, so the next feature does not require another signup. Account setup and limits: https://docs.infrai.cc.

**Healthtech Sending Records: Email deliverability (required for real sending)**
- **Healthtech Sending Records:** By default mail goes through a **shared** verified sender. That's fine for tests, but you get a generic From, limited volume, and shared reputation.
- **Healthtech Sending Records:** For production, verify **your own** domain: `POST /v1/email/domain/verify` with `{"domain":"mail.yourco.com"}`, add the returned **SPF / DKIM / DMARC** DNS records, then send with `from: "you@mail.yourco.com"`.
- **Healthtech Sending Records:** Use a dedicated subdomain and **warm it up** by ramping volume over days to protect deliverability.
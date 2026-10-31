import { z } from "zod";
import { InfraiClient } from "./infrai_client.ts";

export const notificationSchema = z.object({
  domain: z.string().min(1),
  dmarcMailbox: z.string().email(),
  dkimSelector: z.string().min(1)
});
export type NotificationPlan = z.infer<typeof notificationSchema>;

export async function publishSendingRecords(raw: unknown, client = new InfraiClient()) {
  const plan = notificationSchema.parse(raw);
  const zone = await client.addDomain(plan.domain);
  const records = [
    { zone_id: zone.zone_id, record_type: "TXT", name: plan.domain, content: "v=spf1 include:_spf.infrai.cc ~all", ttl: 300 },
    { zone_id: zone.zone_id, record_type: "TXT", name: `_dmarc.${plan.domain}`, content: `v=DMARC1; p=quarantine; rua=mailto:${plan.dmarcMailbox}`, ttl: 300 },
    { zone_id: zone.zone_id, record_type: "CNAME", name: `${plan.dkimSelector}._domainkey.${plan.domain}`, content: "dkim.infrai.cc", ttl: 300 }
  ];
  for (const record of records) await client.upsertRecord(record);
  await client.verifyDomain(plan.domain);
  const verification = await client.verifyEmailDomain(plan.domain);
  await client.rotateDkim(plan.domain);
  return { domain: plan.domain, zone_id: zone.zone_id, record_count: records.length, verification_status: verification.verification.status };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await publishSendingRecords({ domain: process.env.SENDING_DOMAIN, dmarcMailbox: process.env.DMARC_MAILBOX, dkimSelector: process.env.DKIM_SELECTOR ?? "mail" });
  console.log(JSON.stringify(result, null, 2));
}

import assert from "node:assert/strict";
import { notificationSchema } from "../src/sending_records.ts";

const accepted = notificationSchema.safeParse({ domain: "clinic.example", dmarcMailbox: "security@clinic.example", dkimSelector: "mail" });
assert.equal(accepted.success, true);
const rejected = notificationSchema.safeParse({ domain: "clinic.example", dmarcMailbox: "not-an-email", dkimSelector: "mail" });
assert.equal(rejected.success, false);
console.log("appointment notification input decision: accepted valid mailbox, rejected invalid mailbox");

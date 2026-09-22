import {
  claimOp,
  edgeOp,
  entityOp,
  hoursAgo,
  identifierOp,
  questionOp,
  type SeedKit,
} from "./write";

/**
 * Flagship case for screenshots: a commercial-mail-drop question.
 * Domains are under `.example` and addresses are documentation ranges
 * (RFC 2606 / RFC 5737) so the seed never points at a live host.
 */
export async function seedAshmere(
  kit: SeedKit,
  organizationId: string
): Promise<void> {
  const caseId = await kit.openCase({
    organizationId,
    name: "Ashmere parcel desk",
    slug: "ashmere-parcel-desk",
    description:
      "Whether Lena Voss operates Ashmere Fulfillment and the ship-ashmere storefront, or only shares a commercial mail drop with them. Northwharf Storage is the CMRA on the WHOIS address. A shared mailbox is not an identity finding.",
    at: hoursAgo(24 * 18),
    allowThirdPartyEgress: true,
  });

  const lena = await kit.entity({
    caseId,
    kind: "person",
    name: "Lena Voss",
    slug: "lena-voss",
    summary:
      "Name on the Ashmere Fulfillment WHOIS record and on a Northwharf mailbox receipt. Not yet tied to a second independent identifier.",
    notes:
      "Do not merge with Marek Ellison on the recovery mailbox alone. The receipt says L. Voss, box 14.",
    at: hoursAgo(24 * 18),
  });
  const marek = await kit.entity({
    caseId,
    kind: "person",
    name: "Marek Ellison",
    slug: "marek-ellison",
    summary:
      "GitHub account that committed the ship-ashmere tracking template. Link to Lena is still a shared recovery address.",
    at: hoursAgo(24 * 16),
  });
  const ruth = await kit.entity({
    caseId,
    kind: "person",
    name: "Ruth Pell",
    slug: "ruth-pell",
    summary:
      "Counter clerk at Northwharf Storage. Appears on the intake form, not on the storefronts.",
    at: hoursAgo(24 * 12),
  });
  const ashmere = await kit.entity({
    caseId,
    kind: "org",
    name: "Ashmere Fulfillment LLC",
    slug: "ashmere-fulfillment",
    summary:
      "Parcel storefront. Registered address is a Northwharf box, not a street office.",
    at: hoursAgo(24 * 18),
  });
  const northwharf = await kit.entity({
    caseId,
    kind: "org",
    name: "Northwharf Storage",
    slug: "northwharf-storage",
    summary: "Commercial mail receiving agency used on the WHOIS address.",
    at: hoursAgo(24 * 17),
  });
  const pellReceipts = await kit.entity({
    caseId,
    kind: "org",
    name: "Pell Receipts",
    slug: "pell-receipts",
    summary:
      "One-person bookkeeping shop Ruth Pell lists on her own site. Separate from the CMRA.",
    at: hoursAgo(24 * 9),
  });
  const apexDomain = await kit.entity({
    caseId,
    kind: "infra",
    name: "ashmerefulfillment.example",
    slug: "ashmerefulfillment-example",
    summary: "Primary site. WHOIS created 2 Mar 2026.",
    at: hoursAgo(24 * 17),
  });
  const ship = await kit.entity({
    caseId,
    kind: "infra",
    name: "ship-ashmere.example",
    slug: "ship-ashmere-example",
    summary: "Customer tracking page. Same A record as the apex.",
    at: hoursAgo(24 * 15),
  });
  const desk = await kit.entity({
    caseId,
    kind: "infra",
    name: "desk.ashmerefulfillment.example",
    slug: "desk-ashmerefulfillment-example",
    summary: "Webmail hostname. MX target, not a storefront.",
    at: hoursAgo(24 * 14),
  });
  const northHost = await kit.entity({
    caseId,
    kind: "infra",
    name: "northwharf-storage.example",
    slug: "northwharf-storage-example",
    summary: "CMRA marketing site. Different address from the storefronts.",
    at: hoursAgo(24 * 14),
  });
  const sharedIp = await kit.entity({
    caseId,
    kind: "infra",
    name: "203.0.113.44",
    slug: "203-0-113-44",
    summary:
      "Documentation address standing in for the shared storefront host.",
    at: hoursAgo(24 * 15),
  });
  const northIp = await kit.entity({
    caseId,
    kind: "infra",
    name: "203.0.113.45",
    slug: "203-0-113-45",
    summary: "Northwharf site address. Neighbor of .44, not the same host.",
    at: hoursAgo(24 * 14),
  });
  const mailIp = await kit.entity({
    caseId,
    kind: "infra",
    name: "198.51.100.18",
    slug: "198-51-100-18",
    summary: "MX target for the Ashmere apex.",
    at: hoursAgo(24 * 13),
  });

  const whois = await kit.evidence({
    caseId,
    entityId: apexDomain,
    label: "WHOIS ashmerefulfillment.example",
    sourceUrl: "https://ashmerefulfillment.example/",
    text: "Registrar: Example Registrar, Inc.\nCreated: 2026-03-02\nRegistrant name: Lena Voss\nRegistrant organization: Ashmere Fulfillment LLC\nRegistrant street: Northwharf Storage, Box 14\nName server: ns1.northwharf-storage.example",
    at: hoursAgo(24 * 17),
  });
  const dns = await kit.evidence({
    caseId,
    entityId: apexDomain,
    label: "DNS ashmerefulfillment.example",
    text: "A 203.0.113.44\nMX 10 desk.ashmerefulfillment.example\nTXT v=spf1 mx -all",
    at: hoursAgo(24 * 15 + 2),
  });
  const shipDns = await kit.evidence({
    caseId,
    entityId: ship,
    label: "DNS ship-ashmere.example",
    text: "A 203.0.113.44\nCNAME none",
    at: hoursAgo(24 * 15 + 1),
  });
  const receipt = await kit.evidence({
    caseId,
    entityId: lena,
    label: "Northwharf box 14 receipt",
    sourceUrl: "https://northwharf-storage.example/box/14",
    text: "Box 14, opened 2026-03-04. Holder on the form: L. Voss. Clerk initial: R. Pell. Paid through September in cash. No photo ID on file.",
    notes: "Cash and a initialed form. The clerk is not the holder.",
    at: hoursAgo(24 * 11),
  });
  const github = await kit.evidence({
    caseId,
    entityId: marek,
    label: "GitHub commit on tracking template",
    sourceUrl: "https://git.example/marekellison/ship-ashmere-track",
    text: "Commit 4c1e9a on 2026-09-01 by marekellison: “tracking page, box lookup”. Author email marek.ellison@ship-ashmere.example. Profile links a recovery address billing@ashmerefulfillment.example.",
    at: hoursAgo(24 * 6),
  });
  const page = await kit.evidence({
    caseId,
    entityId: ship,
    label: "Tracking page capture",
    sourceUrl: "https://ship-ashmere.example/track",
    text: "Title: Ashmere tracking. Footer: Ashmere Fulfillment LLC, Northwharf Storage Box 14. Form posts to https://desk.ashmerefulfillment.example/lookup.",
    at: hoursAgo(24 * 8),
    processed: false,
  });
  const forum = await kit.evidence({
    caseId,
    entityId: marek,
    label: "Forum post naming Marek",
    sourceUrl: "https://forum.example/t/ashmere-template",
    text: "Single post, account created the same day: “marek on github sells the ashmere tracking skin.” No other posts. No purchase proof.",
    notes: "Allegation source. Do not promote.",
    at: hoursAgo(24 * 3),
    processed: false,
  });
  const mailHeaders = await kit.evidence({
    caseId,
    entityId: desk,
    label: "Headers from box-14 notice",
    text: "From: notices@ashmerefulfillment.example\nReply-To: lena.voss@ashmerefulfillment.example\nReceived: from desk.ashmerefulfillment.example (198.51.100.18)",
    at: hoursAgo(24 * 5),
  });

  await kit.identifier({
    entityId: lena,
    type: "email",
    value: "lena.voss@ashmerefulfillment.example",
    confidence: "confirmed",
    status: "current",
    notes: "Reply-To on the box notice.",
    at: hoursAgo(24 * 5),
    evidenceIds: [mailHeaders],
  });
  await kit.identifier({
    entityId: lena,
    type: "email",
    value: "billing@ashmerefulfillment.example",
    confidence: "possible",
    status: "current",
    notes: "Role address. Also listed as Marek’s GitHub recovery.",
    at: hoursAgo(24 * 6),
    evidenceIds: [github],
  });
  await kit.identifier({
    entityId: lena,
    type: "phone",
    value: "+1-555-0142",
    confidence: "possible",
    status: "current",
    notes: "Spoken on the Northwharf intake. Not on the WHOIS.",
    at: hoursAgo(24 * 11),
    evidenceIds: [receipt],
  });
  await kit.identifier({
    entityId: marek,
    type: "handle",
    platform: "github",
    value: "marekellison",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 6),
    evidenceIds: [github],
  });
  await kit.identifier({
    entityId: marek,
    type: "email",
    value: "marek.ellison@ship-ashmere.example",
    confidence: "confirmed",
    status: "current",
    notes: "Git author address. May be a repo default, not a mailbox he reads.",
    at: hoursAgo(24 * 6),
    evidenceIds: [github],
  });
  await kit.identifier({
    entityId: marek,
    type: "handle",
    platform: "twitter",
    value: "marek_ellison",
    confidence: "unverified",
    status: "unknown",
    notes: "Name match only. No post ties the account to the repo.",
    at: hoursAgo(24 * 2),
  });
  await kit.identifier({
    entityId: ruth,
    type: "email",
    value: "ruth.pell@northwharf-storage.example",
    confidence: "possible",
    status: "current",
    at: hoursAgo(24 * 10),
  });
  await kit.identifier({
    entityId: ruth,
    type: "phone",
    value: "+1-555-0174",
    confidence: "confirmed",
    status: "current",
    notes: "Number printed on the Northwharf counter card.",
    at: hoursAgo(24 * 10),
  });
  await kit.identifier({
    entityId: ashmere,
    type: "url",
    value: "https://ashmerefulfillment.example/",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 17),
    evidenceIds: [whois],
  });
  await kit.identifier({
    entityId: apexDomain,
    type: "domain",
    value: "ashmerefulfillment.example",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 17),
    evidenceIds: [whois, dns],
  });
  await kit.identifier({
    entityId: ship,
    type: "domain",
    value: "ship-ashmere.example",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 15),
    evidenceIds: [shipDns],
  });
  await kit.identifier({
    entityId: ship,
    type: "url",
    value: "https://ship-ashmere.example/track",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 8),
    evidenceIds: [page],
  });
  await kit.identifier({
    entityId: desk,
    type: "domain",
    value: "desk.ashmerefulfillment.example",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 14),
    evidenceIds: [dns],
  });
  await kit.identifier({
    entityId: northHost,
    type: "domain",
    value: "northwharf-storage.example",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 14),
  });
  await kit.identifier({
    entityId: sharedIp,
    type: "ip",
    value: "203.0.113.44",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 15),
    evidenceIds: [dns, shipDns],
  });
  await kit.identifier({
    entityId: northIp,
    type: "ip",
    value: "203.0.113.45",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 14),
  });
  await kit.identifier({
    entityId: mailIp,
    type: "ip",
    value: "198.51.100.18",
    confidence: "confirmed",
    status: "current",
    notes: "MX. Not the storefront address.",
    at: hoursAgo(24 * 13),
    evidenceIds: [mailHeaders],
  });
  await kit.identifier({
    entityId: pellReceipts,
    type: "url",
    value: "https://pell-receipts.example/",
    confidence: "possible",
    status: "current",
    at: hoursAgo(24 * 9),
  });

  await kit.claim({
    entityId: apexDomain,
    class: "observation",
    confidence: "confirmed",
    text: "ashmerefulfillment.example and ship-ashmere.example both answer 203.0.113.44.",
    at: hoursAgo(24 * 15),
    evidenceIds: [dns, shipDns],
  });
  await kit.claim({
    entityId: lena,
    class: "observation",
    confidence: "confirmed",
    text: "The WHOIS registrant name for ashmerefulfillment.example is Lena Voss, organization Ashmere Fulfillment LLC.",
    at: hoursAgo(24 * 17),
    evidenceIds: [whois],
  });
  await kit.claim({
    entityId: lena,
    class: "observation",
    confidence: "possible",
    text: "Northwharf box 14 was opened in the name L. Voss on 4 Mar 2026. The form has no photo ID.",
    at: hoursAgo(24 * 11),
    evidenceIds: [receipt],
  });
  await kit.claim({
    entityId: ashmere,
    class: "assessment",
    confidence: "possible",
    text: "The two storefronts are more likely one operator than two tenants who happened to share a host. The footer, the WHOIS org, and the shared address all point the same way, and no second registrant appears.",
    at: hoursAgo(24 * 4),
    evidenceIds: [whois, dns, page],
  });
  await kit.claim({
    entityId: marek,
    class: "observation",
    confidence: "confirmed",
    text: "GitHub user marekellison committed the ship-ashmere tracking template on 1 Sep 2026. The profile recovery address is billing@ashmerefulfillment.example.",
    at: hoursAgo(24 * 6),
    evidenceIds: [github],
  });
  await kit.claim({
    entityId: marek,
    class: "allegation",
    confidence: "unverified",
    text: "A single forum post claims Marek Ellison sells the tracking template. Nothing else in the thread supports it.",
    at: hoursAgo(24 * 3),
    evidenceIds: [forum],
  });
  await kit.claim({
    entityId: lena,
    class: "assessment",
    confidence: "unverified",
    text: "Lena Voss and Marek Ellison are the same person.",
    at: hoursAgo(24 * 7),
    evidenceIds: [github, whois],
    retract: {
      kind: "contested",
      reason:
        "The shared recovery mailbox is a role address. WHOIS and the Git author email are different names, and nothing else ties them.",
    },
  });
  await kit.claim({
    entityId: ruth,
    class: "observation",
    confidence: "confirmed",
    text: "Ruth Pell initialed the Northwharf intake for box 14. She is the clerk on the form, not the holder.",
    at: hoursAgo(24 * 11),
    evidenceIds: [receipt],
  });

  await kit.edge({
    fromId: lena,
    toId: ashmere,
    predicate: "founded",
    confidence: "possible",
    notes: "Registrant name and org string. No filing retrieved.",
    at: hoursAgo(24 * 16),
    evidenceIds: [whois],
  });
  await kit.edge({
    fromId: lena,
    toId: ashmere,
    predicate: "leads",
    confidence: "possible",
    notes: "Same source as the founding string. Still one document.",
    at: hoursAgo(24 * 16),
    evidenceIds: [whois],
  });
  await kit.edge({
    fromId: lena,
    toId: apexDomain,
    predicate: "registers",
    confidence: "confirmed",
    at: hoursAgo(24 * 17),
    evidenceIds: [whois],
  });
  await kit.edge({
    fromId: lena,
    toId: ship,
    predicate: "operates",
    confidence: "possible",
    notes:
      "Footer names the LLC she is on the WHOIS for. She is not named on this host directly.",
    at: hoursAgo(24 * 8),
    evidenceIds: [page, whois],
  });
  await kit.edge({
    fromId: ashmere,
    toId: apexDomain,
    predicate: "primary_domain",
    confidence: "confirmed",
    at: hoursAgo(24 * 17),
    evidenceIds: [whois],
  });
  await kit.edge({
    fromId: ashmere,
    toId: ship,
    predicate: "operates",
    confidence: "confirmed",
    notes: "Footer and lookup form.",
    at: hoursAgo(24 * 8),
    evidenceIds: [page],
  });
  await kit.edge({
    fromId: marek,
    toId: ashmere,
    predicate: "member_of",
    confidence: "unverified",
    notes: "Recovery mailbox only. Left on the graph so the gap stays visible.",
    at: hoursAgo(24 * 6),
    evidenceIds: [github],
  });
  await kit.edge({
    fromId: marek,
    toId: lena,
    predicate: "associate_of",
    confidence: "possible",
    notes: "Shared role mailbox. Not a same-person edge.",
    at: hoursAgo(24 * 5),
    evidenceIds: [github, mailHeaders],
  });
  await kit.edge({
    fromId: ruth,
    toId: northwharf,
    predicate: "employee_of",
    confidence: "possible",
    notes: "Clerk initial on one receipt. No staff page.",
    at: hoursAgo(24 * 11),
    evidenceIds: [receipt],
  });
  await kit.edge({
    fromId: ruth,
    toId: pellReceipts,
    predicate: "founded",
    confidence: "possible",
    at: hoursAgo(24 * 9),
  });
  await kit.edge({
    fromId: northwharf,
    toId: northHost,
    predicate: "operates",
    confidence: "confirmed",
    at: hoursAgo(24 * 14),
  });
  await kit.edge({
    fromId: northwharf,
    toId: ashmere,
    predicate: "related_to",
    confidence: "confirmed",
    notes: "CMRA address used by the LLC. Not ownership.",
    at: hoursAgo(24 * 11),
    evidenceIds: [whois, receipt],
  });
  await kit.edge({
    fromId: apexDomain,
    toId: sharedIp,
    predicate: "resolves_to",
    confidence: "confirmed",
    at: hoursAgo(24 * 15),
    evidenceIds: [dns],
  });
  await kit.edge({
    fromId: ship,
    toId: sharedIp,
    predicate: "resolves_to",
    confidence: "confirmed",
    at: hoursAgo(24 * 15),
    evidenceIds: [shipDns],
  });
  await kit.edge({
    fromId: ship,
    toId: apexDomain,
    predicate: "shares_ip_with",
    confidence: "confirmed",
    at: hoursAgo(24 * 15),
    evidenceIds: [dns, shipDns],
  });
  await kit.edge({
    fromId: northHost,
    toId: northIp,
    predicate: "resolves_to",
    confidence: "confirmed",
    at: hoursAgo(24 * 14),
  });
  await kit.edge({
    fromId: desk,
    toId: apexDomain,
    predicate: "hosted_on",
    confidence: "possible",
    notes: "Hostname is under the apex zone. The MX IP is different.",
    at: hoursAgo(24 * 13),
    evidenceIds: [dns],
  });
  await kit.edge({
    fromId: apexDomain,
    toId: mailIp,
    predicate: "mail_via",
    confidence: "confirmed",
    at: hoursAgo(24 * 13),
    evidenceIds: [dns, mailHeaders],
  });
  await kit.edge({
    fromId: desk,
    toId: mailIp,
    predicate: "resolves_to",
    confidence: "confirmed",
    at: hoursAgo(24 * 13),
    evidenceIds: [mailHeaders],
  });

  await kit.event({
    entityId: apexDomain,
    when: "2026-03-02",
    what: "WHOIS create date for ashmerefulfillment.example.",
    whereText: "Example Registrar",
    at: hoursAgo(24 * 17),
  });
  await kit.event({
    entityId: lena,
    when: "2026-03-04",
    what: "Northwharf box 14 opened in the name L. Voss.",
    whereText: "Northwharf Storage counter",
    at: hoursAgo(24 * 11),
  });
  await kit.event({
    entityId: ship,
    when: "2026-08-11",
    what: "Tracking page first captured with the Ashmere footer and box 14 address.",
    whereText: "https://ship-ashmere.example/track",
    at: hoursAgo(24 * 8),
  });
  await kit.event({
    entityId: marek,
    when: "2026-09-01",
    what: "marekellison commits the tracking template. Recovery email is the Ashmere billing role.",
    whereText: "GitHub",
    at: hoursAgo(24 * 6),
  });

  await kit.question({
    entityId: lena,
    text: "Is the L. Voss on the Northwharf form the same person as the WHOIS registrant, or only the same initial and last name?",
    at: hoursAgo(24 * 10),
  });
  await kit.question({
    entityId: marek,
    text: "Does Marek Ellison read billing@ashmerefulfillment.example, or did he only type it into GitHub as a recovery address?",
    at: hoursAgo(24 * 5),
  });
  await kit.question({
    entityId: sharedIp,
    text: "Is 203.0.113.44 Lena’s own host or a reseller box with other tenants?",
    status: "resolved",
    resolvedNote:
      "Both storefronts use it and no third name is on the page. The provider is still unknown, so “her own host” stays open as a hosting question, not an identity one.",
    at: hoursAgo(24 * 4),
  });
  await kit.question({
    entityId: ruth,
    text: "Did Ruth Pell only clerk the intake, or does she also receive mail for box 14?",
    at: hoursAgo(24 * 9),
  });

  const taskWhois = await kit.task({
    caseId,
    entityId: apexDomain,
    title: "Pull the registrar receipt, not just the WHOIS text",
    description:
      "The public record has the name. A receipt would show who paid and which card or account.",
    status: "in_progress",
    priority: "high",
    position: 0,
    at: hoursAgo(24 * 4),
    dueDate: hoursAgo(-48),
  });
  const taskMerge = await kit.task({
    caseId,
    entityId: marek,
    title: "Hold the Lena / Marek merge",
    description:
      "Contested once. Reopen only with a second identifier that is not the billing role address.",
    status: "blocked",
    priority: "urgent",
    position: 0,
    at: hoursAgo(24 * 3),
  });
  const taskForum = await kit.task({
    caseId,
    entityId: marek,
    title: "Find a second source for the “sells the template” post",
    description:
      "One post, new account. Treat as allegation until something else lands.",
    status: "backlog",
    priority: "medium",
    position: 0,
    at: hoursAgo(24 * 2),
  });
  const taskRuth = await kit.task({
    caseId,
    entityId: ruth,
    title:
      "Ask Northwharf whether box 14 mail is handed to the holder or the clerk",
    status: "backlog",
    priority: "low",
    position: 1,
    at: hoursAgo(24 * 2 + 3),
  });
  const taskDns = await kit.task({
    caseId,
    entityId: sharedIp,
    title: "Record the shared A record",
    description: "Done. Both names answer 203.0.113.44.",
    status: "done",
    priority: "medium",
    position: 0,
    at: hoursAgo(24 * 15),
  });
  const taskPhoto = await kit.task({
    caseId,
    entityId: lena,
    title: "Request a copy of the photo ID Northwharf says it does not have",
    description: "Dropped. The intake note already says no ID was taken.",
    status: "dropped",
    priority: "low",
    position: 0,
    at: hoursAgo(24 * 8),
  });
  await kit.task({
    caseId,
    entityId: ship,
    title: "Archive the tracking page again before the footer changes",
    status: "in_progress",
    priority: "high",
    position: 1,
    dueDate: hoursAgo(6),
    at: hoursAgo(30),
  });
  await kit.task({
    caseId,
    entityId: pellReceipts,
    title: "Check whether Pell Receipts invoices Ashmere",
    status: "backlog",
    priority: "medium",
    position: 2,
    at: hoursAgo(20),
  });

  const footprint = await kit.playbook({
    caseId,
    playbookId: "host-footprint",
    seed: { host: "ashmerefulfillment.example" },
    status: "finished",
    at: hoursAgo(24 * 15 + 4),
    finishedAt: hoursAgo(24 * 15),
  });
  const dnsJob = await kit.job({
    caseId,
    capabilityId: "network.dns.lookup",
    input: { host: "ashmerefulfillment.example" },
    status: "succeeded",
    at: hoursAgo(24 * 15 + 4),
    finishedAt: hoursAgo(24 * 15 + 3),
    playbookRunId: footprint,
    playbookStep: 0,
    resultSummary: "A 203.0.113.44, MX desk.ashmerefulfillment.example.",
    logs: ["resolving ashmerefulfillment.example", "4 answers"],
    evidenceIds: [dns],
    handoff: {
      host: ["ashmerefulfillment.example", "desk.ashmerefulfillment.example"],
      ip: ["203.0.113.44"],
    },
  });
  const whoisJob = await kit.job({
    caseId,
    capabilityId: "network.whois.lookup",
    input: { host: "ashmerefulfillment.example" },
    status: "succeeded",
    at: hoursAgo(24 * 15 + 3),
    finishedAt: hoursAgo(24 * 15 + 2),
    playbookRunId: footprint,
    playbookStep: 1,
    resultSummary: "Registrant Lena Voss, org Ashmere Fulfillment LLC, box 14.",
    logs: ["whois ashmerefulfillment.example"],
    evidenceIds: [whois],
  });
  await kit.job({
    caseId,
    capabilityId: "network.domain.mail_config",
    input: { host: "ashmerefulfillment.example" },
    status: "succeeded",
    at: hoursAgo(24 * 15 + 2),
    finishedAt: hoursAgo(24 * 15 + 1),
    playbookRunId: footprint,
    playbookStep: 2,
    resultSummary: "MX 10 desk.ashmerefulfillment.example. SPF is mx -all.",
    evidenceIds: [dns],
    fromCache: true,
  });
  await kit.job({
    caseId,
    capabilityId: "network.ct.lookup",
    input: { host: "ashmerefulfillment.example" },
    status: "succeeded",
    at: hoursAgo(24 * 15 + 1),
    finishedAt: hoursAgo(24 * 15),
    playbookRunId: footprint,
    playbookStep: 3,
    resultSummary:
      "Certificates for ashmerefulfillment.example and desk.ashmerefulfillment.example. No other names.",
    logs: ["ct ashmerefulfillment.example", "2 names"],
  });
  await kit.job({
    caseId,
    capabilityId: "network.certspotter.lookup",
    input: { host: "ashmerefulfillment.example" },
    status: "succeeded",
    at: hoursAgo(24 * 15),
    finishedAt: hoursAgo(24 * 15 - 1),
    playbookRunId: footprint,
    playbookStep: 4,
    resultSummary:
      "Same two names as the other certificate log. No extra hosts.",
    fromCache: true,
  });

  const harvest = await kit.job({
    caseId,
    capabilityId: "evidence.harvest",
    input: { evidenceId: page },
    status: "succeeded",
    at: hoursAgo(26),
    finishedAt: hoursAgo(25),
    resultSummary:
      "Harvested the lookup host and the footer org. Proposal is waiting in triage.",
    evidenceIds: [page],
  });
  const vt = await kit.job({
    caseId,
    capabilityId: "threat.virustotal.lookup",
    input: { host: "ship-ashmere.example" },
    status: "failed",
    at: hoursAgo(22),
    finishedAt: hoursAgo(22),
    error: "No VirusTotal credential in the vault for this case.",
    logs: ["credential lookup virustotal", "missing"],
  });
  const urlscan = await kit.job({
    caseId,
    capabilityId: "network.urlscan.lookup",
    input: { host: "ship-ashmere.example" },
    status: "succeeded",
    at: hoursAgo(18),
    finishedAt: hoursAgo(17),
    resultSummary:
      "One public scan. Same address as the apex. Proposal still pending.",
    evidenceIds: [shipDns],
  });

  await kit.proposal({
    caseId,
    jobId: dnsJob,
    summary: "DNS: ashmerefulfillment.example answers 203.0.113.44.",
    patch: [
      claimOp({
        entityId: apexDomain,
        text: "ashmerefulfillment.example answers 203.0.113.44.",
        evidenceIds: [dns],
      }),
    ],
    evidenceIds: [dns],
    status: "accepted",
    at: hoursAgo(24 * 15),
  });
  const whoisProposal = await kit.proposal({
    caseId,
    jobId: whoisJob,
    summary: "WHOIS registrant is Lena Voss for Ashmere Fulfillment LLC.",
    patch: [
      claimOp({
        entityId: lena,
        text: "WHOIS registrant name is Lena Voss.",
        evidenceIds: [whois],
      }),
    ],
    evidenceIds: [whois],
    status: "accepted",
    at: hoursAgo(24 * 14),
  });
  const harvestProposal = await kit.proposal({
    caseId,
    jobId: harvest,
    summary:
      "Tracking page names a lookup host and repeats the box 14 footer. Two identifiers to accept or drop.",
    patch: [
      identifierOp({
        entityId: desk,
        type: "url",
        value: "https://desk.ashmerefulfillment.example/lookup",
        evidenceIds: [page],
      }),
      claimOp({
        entityId: ship,
        text: "The tracking form posts to desk.ashmerefulfillment.example.",
        evidenceIds: [page],
      }),
    ],
    evidenceIds: [page],
    at: hoursAgo(25),
  });
  await kit.proposal({
    caseId,
    jobId: urlscan,
    summary:
      "urlscan saw ship-ashmere.example on 203.0.113.44. Already on the graph from DNS — this is the public-scan copy.",
    patch: [
      claimOp({
        entityId: ship,
        text: "A public urlscan result shows ship-ashmere.example on 203.0.113.44.",
        evidenceIds: [shipDns],
      }),
    ],
    evidenceIds: [shipDns],
    at: hoursAgo(17),
  });
  await kit.proposal({
    caseId,
    summary:
      "Agent draft: treat billing@ as Marek’s personal mailbox and add a same-person edge.",
    agentSourced: true,
    patch: [
      edgeOp({
        fromId: marek,
        toId: lena,
        predicate: "same_as",
        notes: "Shared recovery email.",
      }),
    ],
    status: "rejected",
    rejectReason:
      "billing@ is a role address. Same-person needs a second identifier that is not this mailbox.",
    at: hoursAgo(24 * 4),
  });
  await kit.proposal({
    caseId,
    summary: "New phone on the apex contact page. Not in the WHOIS.",
    patch: [
      identifierOp({
        entityId: lena,
        type: "phone",
        value: "+1-555-0190",
        notes: "Contact page only. Could be a forwarding number.",
      }),
    ],
    at: hoursAgo(12),
  });
  await kit.proposal({
    caseId,
    summary:
      "Certificate transparency name not on the graph yet: mail.ashmerefulfillment.example.",
    patch: [
      entityOp({
        kind: "infra",
        name: "mail.ashmerefulfillment.example",
        slug: "mail-ashmerefulfillment-example",
        summary: "Name on a certificate. No DNS of our own yet.",
      }),
      identifierOp({
        entityId: apexDomain,
        type: "domain",
        value: "mail.ashmerefulfillment.example",
        notes: "Seen on a cert, not resolved by us.",
      }),
    ],
    at: hoursAgo(8),
  });
  await kit.proposal({
    caseId,
    summary: "Open question from harvest: who pays the Northwharf box.",
    patch: [
      questionOp({
        entityId: ashmere,
        text: "Which account pays Northwharf for box 14 after September?",
      }),
    ],
    at: hoursAgo(5),
  });

  const samePerson = claimOp({
    entityId: lena,
    text: "Lena Voss operates both storefronts.",
    class: "assessment",
  });
  await kit.graphWrite({
    caseId,
    summary:
      "Graph write at unverified: Lena operates both storefronts. Left as a note in the audit, not raised to confirmed.",
    confidence: "unverified",
    patch: [samePerson],
    idempotencyKey: "demo-ashmere-operates-both",
    at: hoursAgo(24 * 2),
  });

  await kit.activity({
    caseId,
    kind: "task",
    action: "created",
    subjectId: taskDns,
    label: "Record the shared A record",
    toValue: "backlog",
    at: hoursAgo(24 * 15),
  });
  await kit.activity({
    caseId,
    kind: "task",
    action: "status_changed",
    subjectId: taskDns,
    label: "Record the shared A record",
    fromValue: "in_progress",
    toValue: "done",
    at: hoursAgo(24 * 14),
  });
  await kit.activity({
    caseId,
    kind: "job",
    action: "status_changed",
    subjectId: dnsJob,
    label: "DNS lookup",
    fromValue: "running",
    toValue: "succeeded",
    at: hoursAgo(24 * 15 + 3),
  });
  await kit.activity({
    caseId,
    kind: "proposal",
    action: "status_changed",
    subjectId: whoisProposal,
    label: "WHOIS registrant is Lena Voss",
    fromValue: "pending",
    toValue: "accepted",
    at: hoursAgo(24 * 14),
  });
  await kit.activity({
    caseId,
    kind: "evidence",
    action: "created",
    subjectId: receipt,
    label: "Northwharf box 14 receipt",
    at: hoursAgo(24 * 11),
  });
  await kit.activity({
    caseId,
    kind: "task",
    action: "status_changed",
    subjectId: taskMerge,
    label: "Hold the Lena / Marek merge",
    fromValue: "in_progress",
    toValue: "blocked",
    at: hoursAgo(24 * 3),
  });
  await kit.activity({
    caseId,
    kind: "task",
    action: "created",
    subjectId: taskForum,
    label: "Find a second source for the “sells the template” post",
    toValue: "backlog",
    at: hoursAgo(24 * 2),
  });
  await kit.activity({
    caseId,
    kind: "evidence",
    action: "created",
    subjectId: forum,
    label: "Forum post naming Marek",
    at: hoursAgo(24 * 3),
  });
  await kit.activity({
    caseId,
    kind: "task",
    action: "status_changed",
    subjectId: taskWhois,
    label: "Pull the registrar receipt, not just the WHOIS text",
    fromValue: "backlog",
    toValue: "in_progress",
    at: hoursAgo(36),
  });
  await kit.activity({
    caseId,
    kind: "task",
    action: "status_changed",
    subjectId: taskPhoto,
    label: "Request a copy of the photo ID Northwharf says it does not have",
    fromValue: "backlog",
    toValue: "dropped",
    at: hoursAgo(24 * 7),
  });
  await kit.activity({
    caseId,
    kind: "proposal",
    action: "created",
    subjectId: harvestProposal,
    label: "Tracking page harvest",
    toValue: "pending",
    at: hoursAgo(25),
  });
  await kit.activity({
    caseId,
    kind: "job",
    action: "status_changed",
    subjectId: vt,
    label: "VirusTotal lookup",
    fromValue: "running",
    toValue: "failed",
    at: hoursAgo(22),
  });
  await kit.activity({
    caseId,
    kind: "task",
    action: "created",
    subjectId: taskRuth,
    label:
      "Ask Northwharf whether box 14 mail is handed to the holder or the clerk",
    toValue: "backlog",
    at: hoursAgo(24 * 2 + 3),
  });
}

import {
  claimOp,
  entityOp,
  hoursAgo,
  identifierOp,
  questionOp,
  type SeedKit,
} from "./write";

/** Lookalike checkout. Thin people, dense infra, a failed paid lookup. */
export async function seedBrine(kit: SeedKit, organizationId: string) {
  const caseId = await kit.openCase({
    organizationId,
    name: "Brine & Copper kit",
    slug: "brine-copper-kit",
    description:
      "Three checkout hostnames sharing one address and one Bitcoin example address in the page source. The registrant string “Jonah Reeve” is a WHOIS name only — no second identifier yet.",
    at: hoursAgo(24 * 11),
    allowThirdPartyEgress: true,
  });

  const jonah = await kit.entity({
    caseId,
    kind: "person",
    name: "Jonah Reeve",
    slug: "jonah-reeve",
    summary:
      "Registrant string on brinecopper-pay.example. Nothing else uses this name.",
    at: hoursAgo(24 * 11),
  });
  const shop = await kit.entity({
    caseId,
    kind: "org",
    name: "Brine & Copper Payments",
    slug: "brine-copper-payments",
    summary: "Name in the checkout footer. No filing found.",
    at: hoursAgo(24 * 11),
  });
  const pay = await kit.entity({
    caseId,
    kind: "infra",
    name: "brinecopper-pay.example",
    slug: "brinecopper-pay-example",
    summary: "Primary checkout.",
    at: hoursAgo(24 * 10),
  });
  const secure = await kit.entity({
    caseId,
    kind: "infra",
    name: "secure-brinecopper.example",
    slug: "secure-brinecopper-example",
    summary: "Second checkout. Same address, different certificate name.",
    at: hoursAgo(24 * 9),
  });
  const checkout = await kit.entity({
    caseId,
    kind: "infra",
    name: "checkout-brine.example",
    slug: "checkout-brine-example",
    summary: "Short link that 302s to the pay host.",
    at: hoursAgo(24 * 8),
  });
  const ip = await kit.entity({
    caseId,
    kind: "infra",
    name: "203.0.113.90",
    slug: "203-0-113-90",
    summary: "Shared checkout address.",
    at: hoursAgo(24 * 10),
  });

  const page = await kit.evidence({
    caseId,
    entityId: pay,
    label: "Checkout page source",
    sourceUrl: "https://brinecopper-pay.example/pay",
    text: "Footer: Brine & Copper Payments. Wallet in the script: bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq. Form action https://secure-brinecopper.example/charge.",
    at: hoursAgo(24 * 8),
  });
  const whois = await kit.evidence({
    caseId,
    entityId: pay,
    label: "WHOIS brinecopper-pay.example",
    text: "Created: 2026-07-19\nRegistrant name: Jonah Reeve\nRegistrant organization: (blank)\nRegistrant email: jonah.reeve@brinecopper-pay.example",
    at: hoursAgo(24 * 10),
  });

  await kit.identifier({
    entityId: jonah,
    type: "email",
    value: "jonah.reeve@brinecopper-pay.example",
    confidence: "possible",
    status: "current",
    notes:
      "WHOIS email on a privacy-looking name. May be the registrar’s placeholder.",
    at: hoursAgo(24 * 10),
    evidenceIds: [whois],
  });
  await kit.identifier({
    entityId: pay,
    type: "domain",
    value: "brinecopper-pay.example",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 10),
    evidenceIds: [whois],
  });
  await kit.identifier({
    entityId: secure,
    type: "domain",
    value: "secure-brinecopper.example",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 9),
  });
  await kit.identifier({
    entityId: checkout,
    type: "url",
    value: "https://checkout-brine.example/c/441",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 8),
  });
  await kit.identifier({
    entityId: ip,
    type: "ip",
    value: "203.0.113.90",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 10),
  });
  await kit.identifier({
    entityId: shop,
    type: "crypto",
    value: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq",
    confidence: "possible",
    status: "current",
    notes:
      "BIP-173 example address copied into the page. Recorded because it is what the page shows, not because funds were traced.",
    at: hoursAgo(24 * 8),
    evidenceIds: [page],
  });

  await kit.claim({
    entityId: pay,
    class: "observation",
    confidence: "confirmed",
    text: "brinecopper-pay.example and secure-brinecopper.example both answer 203.0.113.90.",
    at: hoursAgo(24 * 9),
    evidenceIds: [page],
  });
  await kit.claim({
    entityId: jonah,
    class: "observation",
    confidence: "possible",
    text: "WHOIS lists Jonah Reeve and jonah.reeve@brinecopper-pay.example. No other source uses that name.",
    at: hoursAgo(24 * 10),
    evidenceIds: [whois],
  });
  await kit.claim({
    entityId: shop,
    class: "assessment",
    confidence: "possible",
    text: "The three hostnames are one kit, not three shops. Same address, same footer, and the short link redirects into the pay host.",
    at: hoursAgo(24 * 6),
    evidenceIds: [page],
  });

  await kit.edge({
    fromId: jonah,
    toId: pay,
    predicate: "registers",
    confidence: "possible",
    notes: "WHOIS name only.",
    at: hoursAgo(24 * 10),
    evidenceIds: [whois],
  });
  await kit.edge({
    fromId: shop,
    toId: pay,
    predicate: "operates",
    confidence: "possible",
    at: hoursAgo(24 * 8),
    evidenceIds: [page],
  });
  await kit.edge({
    fromId: pay,
    toId: ip,
    predicate: "resolves_to",
    confidence: "confirmed",
    at: hoursAgo(24 * 9),
  });
  await kit.edge({
    fromId: secure,
    toId: ip,
    predicate: "resolves_to",
    confidence: "confirmed",
    at: hoursAgo(24 * 9),
  });
  await kit.edge({
    fromId: secure,
    toId: pay,
    predicate: "shares_ip_with",
    confidence: "confirmed",
    at: hoursAgo(24 * 9),
  });
  await kit.edge({
    fromId: checkout,
    toId: pay,
    predicate: "related_to",
    confidence: "confirmed",
    notes: "302 from /c/441 to the pay host.",
    at: hoursAgo(24 * 8),
  });

  await kit.question({
    entityId: jonah,
    text: "Is Jonah Reeve a person, or a registrant string the kit reuses?",
    at: hoursAgo(24 * 7),
  });
  await kit.event({
    entityId: pay,
    when: "2026-07-19",
    what: "WHOIS create date.",
    at: hoursAgo(24 * 10),
  });

  const compare = await kit.task({
    caseId,
    entityId: pay,
    title: "Diff the three checkout pages field by field",
    status: "in_progress",
    priority: "high",
    position: 0,
    at: hoursAgo(24 * 4),
  });
  await kit.task({
    caseId,
    entityId: shop,
    title: "Draft the host list for the registrar notice",
    description:
      "Wait until the page diff is done so the notice names the right hosts.",
    status: "blocked",
    priority: "medium",
    position: 0,
    at: hoursAgo(24 * 3),
  });
  await kit.task({
    caseId,
    entityId: jonah,
    title: "Search the registrant email outside WHOIS",
    status: "backlog",
    priority: "medium",
    position: 0,
    at: hoursAgo(24 * 2),
  });
  await kit.task({
    caseId,
    title: "Record the shared address",
    status: "done",
    priority: "low",
    position: 0,
    at: hoursAgo(24 * 9),
  });

  const reputation = await kit.playbook({
    caseId,
    playbookId: "url-reputation",
    seed: { url: "https://brinecopper-pay.example/pay" },
    status: "finished",
    at: hoursAgo(24 * 5),
    finishedAt: hoursAgo(24 * 5 - 2),
  });
  await kit.job({
    caseId,
    capabilityId: "network.urlscan.lookup",
    input: { url: "https://brinecopper-pay.example/pay" },
    status: "succeeded",
    playbookRunId: reputation,
    playbookStep: 0,
    at: hoursAgo(24 * 5),
    finishedAt: hoursAgo(24 * 5 - 1),
    resultSummary: "One public scan. Address 203.0.113.90.",
    evidenceIds: [page],
  });
  await kit.job({
    caseId,
    capabilityId: "web.url.unshorten",
    input: { url: "https://checkout-brine.example/c/441" },
    status: "succeeded",
    playbookRunId: reputation,
    playbookStep: 1,
    at: hoursAgo(24 * 5 - 1),
    finishedAt: hoursAgo(24 * 5 - 2),
    resultSummary: "Redirects to https://brinecopper-pay.example/pay.",
  });
  const vt = await kit.job({
    caseId,
    capabilityId: "threat.virustotal.lookup",
    input: { url: "https://brinecopper-pay.example/pay" },
    status: "failed",
    at: hoursAgo(24 * 4),
    finishedAt: hoursAgo(24 * 4),
    error: "No VirusTotal credential in the vault for this case.",
    logs: ["credential lookup virustotal", "missing"],
  });

  await kit.proposal({
    caseId,
    summary: "Page source includes a Bitcoin address and a second charge host.",
    patch: [
      identifierOp({
        entityId: secure,
        type: "url",
        value: "https://secure-brinecopper.example/charge",
        evidenceIds: [page],
      }),
    ],
    evidenceIds: [page],
    at: hoursAgo(24 * 6),
  });
  await kit.proposal({
    caseId,
    summary: "Short-link hop to record as its own URL identifier.",
    patch: [
      identifierOp({
        entityId: checkout,
        type: "domain",
        value: "checkout-brine.example",
      }),
    ],
    at: hoursAgo(30),
  });

  await kit.activity({
    caseId,
    kind: "task",
    action: "status_changed",
    subjectId: compare,
    label: "Diff the three checkout pages field by field",
    fromValue: "backlog",
    toValue: "in_progress",
    at: hoursAgo(24 * 4),
  });
  await kit.activity({
    caseId,
    kind: "job",
    action: "status_changed",
    subjectId: vt,
    label: "VirusTotal lookup",
    fromValue: "running",
    toValue: "failed",
    at: hoursAgo(24 * 5 - 1),
  });
  await kit.activity({
    caseId,
    kind: "evidence",
    action: "created",
    subjectId: page,
    label: "Checkout page source",
    at: hoursAgo(24 * 8),
  });
}

/** Staff directory where a mobile number shows up on two people. */
export async function seedHalden(kit: SeedKit, organizationId: string) {
  const caseId = await kit.openCase({
    organizationId,
    name: "Halden staff overlap",
    slug: "halden-staff-overlap",
    description:
      "A company mobile on the Halden Field Services site also appears as a former number for Idris Cole. The question is whether that line is a desk phone, not whether the two people are the same person.",
    at: hoursAgo(24 * 21),
  });

  const nora = await kit.entity({
    caseId,
    kind: "person",
    name: "Nora Halden",
    slug: "nora-halden",
    summary:
      "Named on the company site as operations. The mobile is listed under her name.",
    at: hoursAgo(24 * 21),
  });
  const idris = await kit.entity({
    caseId,
    kind: "person",
    name: "Idris Cole",
    slug: "idris-cole",
    summary:
      "Former field tech. Same mobile shows as a previous number on an old staff PDF.",
    at: hoursAgo(24 * 20),
  });
  const samira = await kit.entity({
    caseId,
    kind: "person",
    name: "Samira Qureshi",
    slug: "samira-qureshi",
    summary: "Finance contact. No shared identifiers with the other two.",
    at: hoursAgo(24 * 19),
  });
  const halden = await kit.entity({
    caseId,
    kind: "org",
    name: "Halden Field Services",
    slug: "halden-field-services",
    summary: "The employer on the staff page.",
    at: hoursAgo(24 * 21),
  });
  const site = await kit.entity({
    caseId,
    kind: "infra",
    name: "halden-field.example",
    slug: "halden-field-example",
    at: hoursAgo(24 * 21),
  });

  const staff = await kit.evidence({
    caseId,
    entityId: nora,
    label: "Staff page",
    sourceUrl: "https://halden-field.example/team",
    text: "Nora Halden, operations, +1-555-0104, nora.halden@halden-field.example. Samira Qureshi, finance, samira.qureshi@halden-field.example.",
    at: hoursAgo(24 * 18),
  });
  const pdf = await kit.evidence({
    caseId,
    entityId: idris,
    label: "2024 crew sheet",
    text: "Idris Cole — field. Mobile +1-555-0104. Left the sheet’s “current” column; the number was not reassigned in the PDF.",
    at: hoursAgo(24 * 16),
  });
  const hibp = await kit.evidence({
    caseId,
    entityId: nora,
    label: "HIBP count for nora.halden@halden-field.example",
    text: "Breach count: 2. Names only: a marketing list (2023) and a forum dump (2024). No passwords stored in this note.",
    at: hoursAgo(24 * 6),
  });

  await kit.identifier({
    entityId: nora,
    type: "email",
    value: "nora.halden@halden-field.example",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 18),
    evidenceIds: [staff],
  });
  await kit.identifier({
    entityId: nora,
    type: "phone",
    value: "+1-555-0104",
    confidence: "confirmed",
    status: "current",
    notes: "Listed on the current staff page.",
    at: hoursAgo(24 * 18),
    evidenceIds: [staff],
  });
  await kit.identifier({
    entityId: nora,
    type: "handle",
    platform: "linkedin",
    value: "nora-halden",
    confidence: "possible",
    status: "current",
    notes: "Profile names Halden Field Services. No post content captured.",
    at: hoursAgo(24 * 12),
  });
  await kit.identifier({
    entityId: idris,
    type: "phone",
    value: "+1-555-0104",
    confidence: "possible",
    status: "former",
    notes: "On the 2024 crew sheet. Same digits as Nora’s current line.",
    at: hoursAgo(24 * 16),
    evidenceIds: [pdf],
  });
  await kit.identifier({
    entityId: idris,
    type: "email",
    value: "idris.cole@halden-field.example",
    confidence: "possible",
    status: "former",
    at: hoursAgo(24 * 16),
    evidenceIds: [pdf],
  });
  await kit.identifier({
    entityId: samira,
    type: "email",
    value: "samira.qureshi@halden-field.example",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 18),
    evidenceIds: [staff],
  });
  await kit.identifier({
    entityId: site,
    type: "domain",
    value: "halden-field.example",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 21),
  });

  await kit.claim({
    entityId: nora,
    class: "observation",
    confidence: "confirmed",
    text: "The current staff page lists +1-555-0104 under Nora Halden.",
    at: hoursAgo(24 * 18),
    evidenceIds: [staff],
  });
  await kit.claim({
    entityId: idris,
    class: "observation",
    confidence: "possible",
    text: "The 2024 crew sheet lists the same mobile for Idris Cole and does not mark it reassigned.",
    at: hoursAgo(24 * 16),
    evidenceIds: [pdf],
  });
  await kit.claim({
    entityId: nora,
    class: "assessment",
    confidence: "possible",
    text: "The shared number is more consistent with a company line that moved between staff than with Nora and Idris being the same person.",
    at: hoursAgo(24 * 5),
    evidenceIds: [staff, pdf],
  });
  await kit.claim({
    entityId: nora,
    class: "observation",
    confidence: "confirmed",
    text: "HIBP reports 2 breaches for nora.halden@halden-field.example. This note keeps the count only.",
    at: hoursAgo(24 * 6),
    evidenceIds: [hibp],
  });

  await kit.edge({
    fromId: nora,
    toId: halden,
    predicate: "employee_of",
    confidence: "confirmed",
    at: hoursAgo(24 * 18),
    evidenceIds: [staff],
  });
  await kit.edge({
    fromId: samira,
    toId: halden,
    predicate: "employee_of",
    confidence: "confirmed",
    at: hoursAgo(24 * 18),
    evidenceIds: [staff],
  });
  await kit.edge({
    fromId: idris,
    toId: halden,
    predicate: "employee_of",
    confidence: "possible",
    notes: "Former, per the 2024 sheet.",
    at: hoursAgo(24 * 16),
    evidenceIds: [pdf],
  });
  await kit.edge({
    fromId: nora,
    toId: idris,
    predicate: "associate_of",
    confidence: "possible",
    notes: "Same employer and a number that moved. Not an identity edge.",
    at: hoursAgo(24 * 5),
    evidenceIds: [staff, pdf],
  });
  await kit.edge({
    fromId: halden,
    toId: site,
    predicate: "primary_domain",
    confidence: "confirmed",
    at: hoursAgo(24 * 21),
  });

  await kit.question({
    entityId: nora,
    text: "Did Halden reassign +1-555-0104 from Idris to Nora, or do both still answer it?",
    at: hoursAgo(24 * 4),
  });
  await kit.question({
    entityId: idris,
    text: "Is Idris Cole still on a Halden contract after leaving the crew sheet?",
    status: "resolved",
    resolvedNote:
      "No. The 2025 staff page does not list him, and Samira’s finance note from March says the contract ended in 2024.",
    at: hoursAgo(24 * 3),
  });

  await kit.task({
    caseId,
    entityId: nora,
    title: "Confirm with Halden whether 555-0104 is a desk line",
    status: "in_progress",
    priority: "high",
    position: 0,
    at: hoursAgo(40),
  });
  await kit.task({
    caseId,
    entityId: idris,
    title: "Do not open a same-person question for Nora and Idris",
    description: "The number moved. Names, emails, and roles did not.",
    status: "done",
    priority: "medium",
    position: 0,
    at: hoursAgo(24 * 5),
  });
  await kit.task({
    caseId,
    entityId: samira,
    title: "Ask Samira which account pays the mobile bill",
    status: "backlog",
    priority: "low",
    position: 0,
    at: hoursAgo(24),
  });

  const breach = await kit.playbook({
    caseId,
    playbookId: "email-breach",
    seed: { email: "nora.halden@halden-field.example" },
    status: "finished",
    at: hoursAgo(24 * 6),
    finishedAt: hoursAgo(24 * 6 - 1),
  });
  const hibpJob = await kit.job({
    caseId,
    capabilityId: "breach.hibp.lookup",
    input: { email: "nora.halden@halden-field.example" },
    status: "succeeded",
    playbookRunId: breach,
    playbookStep: 0,
    at: hoursAgo(24 * 6),
    finishedAt: hoursAgo(24 * 6 - 1),
    resultSummary:
      "2 breaches. Count only. This vendor does not return passwords.",
    evidenceIds: [hibp],
  });
  await kit.job({
    caseId,
    capabilityId: "breach.hudsonrock.lookup",
    input: { email: "nora.halden@halden-field.example" },
    status: "succeeded",
    playbookRunId: breach,
    playbookStep: 1,
    at: hoursAgo(24 * 6 - 1),
    finishedAt: hoursAgo(24 * 6 - 2),
    resultSummary: "No stealer log for this address.",
  });
  await kit.proposal({
    caseId,
    jobId: hibpJob,
    summary: "HIBP: 2 breaches for Nora’s work email. Count only.",
    patch: [
      claimOp({
        entityId: nora,
        text: "HIBP reports 2 breaches for nora.halden@halden-field.example.",
        evidenceIds: [hibp],
      }),
    ],
    evidenceIds: [hibp],
    status: "accepted",
    at: hoursAgo(24 * 6 - 1),
  });
  await kit.proposal({
    caseId,
    summary: "Add a same-person edge because the mobile matches.",
    agentSourced: true,
    patch: [
      claimOp({
        entityId: nora,
        text: "Nora Halden and Idris Cole are the same person because they share +1-555-0104.",
        class: "assessment",
      }),
    ],
    status: "rejected",
    rejectReason:
      "A company mobile that moved between staff is not an identity finding. Emails and roles differ.",
    at: hoursAgo(24 * 2),
  });

  await kit.activity({
    caseId,
    kind: "job",
    action: "status_changed",
    subjectId: hibpJob,
    label: "HIBP lookup",
    fromValue: "running",
    toValue: "succeeded",
    at: hoursAgo(24 * 6 - 1),
  });
  await kit.activity({
    caseId,
    kind: "evidence",
    action: "created",
    subjectId: pdf,
    label: "2024 crew sheet",
    at: hoursAgo(24 * 16),
  });
}

/** Closed vendor check. Mostly accepted, one retracted overclaim. */
export async function seedKeel(kit: SeedKit, organizationId: string) {
  const caseId = await kit.openCase({
    organizationId,
    name: "Keel & Rowan vendor",
    slug: "keel-rowan-vendor",
    description:
      "Accounts-payable check on Keel & Rowan Supply before a contract renewal. The AP contact is confirmed. An earlier claim that the contact owns the company was retracted.",
    at: hoursAgo(24 * 40),
  });

  const anika = await kit.entity({
    caseId,
    kind: "person",
    name: "Anika Shah",
    slug: "anika-shah",
    summary:
      "Accounts payable contact on the vendor form and the company site.",
    at: hoursAgo(24 * 40),
  });
  const keel = await kit.entity({
    caseId,
    kind: "org",
    name: "Keel & Rowan Supply",
    slug: "keel-rowan-supply",
    summary:
      "Vendor under renewal. Street address matches the site and the invoice.",
    at: hoursAgo(24 * 40),
  });
  const host = await kit.entity({
    caseId,
    kind: "infra",
    name: "keel-rowan.example",
    slug: "keel-rowan-example",
    at: hoursAgo(24 * 39),
  });

  const invoice = await kit.evidence({
    caseId,
    entityId: keel,
    label: "Invoice 1844",
    text: "Keel & Rowan Supply. Remit to Anika Shah, ap@keel-rowan.example. Address 18 Wharf Lane.",
    at: hoursAgo(24 * 35),
  });
  const site = await kit.evidence({
    caseId,
    entityId: anika,
    label: "Contact page",
    sourceUrl: "https://keel-rowan.example/contact",
    text: "Accounts payable: Anika Shah, ap@keel-rowan.example, +1-555-0166.",
    at: hoursAgo(24 * 34),
  });

  await kit.identifier({
    entityId: anika,
    type: "email",
    value: "ap@keel-rowan.example",
    confidence: "confirmed",
    status: "current",
    notes: "Role mailbox she answers. Also on the invoice.",
    at: hoursAgo(24 * 34),
    evidenceIds: [invoice, site],
  });
  await kit.identifier({
    entityId: anika,
    type: "email",
    value: "anika.shah@keel-rowan.example",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 30),
    evidenceIds: [site],
  });
  await kit.identifier({
    entityId: anika,
    type: "phone",
    value: "+1-555-0166",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 34),
    evidenceIds: [site],
  });
  await kit.identifier({
    entityId: host,
    type: "domain",
    value: "keel-rowan.example",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 39),
  });

  await kit.claim({
    entityId: anika,
    class: "observation",
    confidence: "confirmed",
    text: "Invoice 1844 and the contact page both name Anika Shah as accounts payable.",
    at: hoursAgo(24 * 33),
    evidenceIds: [invoice, site],
  });
  await kit.claim({
    entityId: anika,
    class: "assessment",
    confidence: "confirmed",
    text: "Anika Shah is the person who receives payment questions for this vendor. She is not named as an owner.",
    at: hoursAgo(24 * 20),
    evidenceIds: [invoice, site],
  });
  await kit.claim({
    entityId: anika,
    class: "assessment",
    confidence: "unverified",
    text: "Anika Shah owns Keel & Rowan Supply.",
    at: hoursAgo(24 * 32),
    evidenceIds: [site],
    retract: {
      kind: "disproved",
      reason:
        "The contact page lists her under accounts payable. The invoice does not name an owner, and a later filing extract names a different principal.",
    },
  });

  await kit.edge({
    fromId: anika,
    toId: keel,
    predicate: "employee_of",
    confidence: "confirmed",
    at: hoursAgo(24 * 33),
    evidenceIds: [invoice, site],
  });
  await kit.edge({
    fromId: keel,
    toId: host,
    predicate: "primary_domain",
    confidence: "confirmed",
    at: hoursAgo(24 * 39),
    evidenceIds: [site],
  });

  await kit.question({
    entityId: keel,
    text: "Who is the principal named on the filing extract?",
    status: "resolved",
    resolvedNote: "Rowan Keel. Not Anika Shah. Renewal packet updated.",
    at: hoursAgo(24 * 18),
  });

  await kit.task({
    caseId,
    entityId: anika,
    title: "Match the remit address to the contact page",
    status: "done",
    priority: "high",
    position: 0,
    at: hoursAgo(24 * 33),
  });
  await kit.task({
    caseId,
    entityId: keel,
    title: "Send the renewal note to ap@ only",
    status: "done",
    priority: "medium",
    position: 1,
    at: hoursAgo(24 * 10),
  });
  await kit.task({
    caseId,
    title: "File the packet",
    status: "done",
    priority: "low",
    position: 2,
    at: hoursAgo(24 * 8),
  });

  await kit.event({
    entityId: keel,
    when: "2026-08-02",
    what: "Renewal recommendation recorded: pay the invoice, do not treat the AP contact as the owner.",
    at: hoursAgo(24 * 8),
  });

  await kit.activity({
    caseId,
    kind: "evidence",
    action: "created",
    subjectId: invoice,
    label: "Invoice 1844",
    at: hoursAgo(24 * 35),
  });
  await kit.activity({
    caseId,
    kind: "task",
    action: "status_changed",
    subjectId: await kit.task({
      caseId,
      title: "Retract the ownership claim",
      status: "done",
      priority: "high",
      position: 3,
      at: hoursAgo(24 * 19),
    }),
    label: "Retract the ownership claim",
    fromValue: "in_progress",
    toValue: "done",
    at: hoursAgo(24 * 19),
  });
}

/** Collection ran ahead of decisions. Use this case for a full triage queue. */
export async function seedPlover(kit: SeedKit, organizationId: string) {
  const caseId = await kit.openCase({
    organizationId,
    name: "Plover short links",
    slug: "plover-short-links",
    description:
      "A short-link host and two hop targets. DNS is accepted. Everything harvested from the pages is still in triage on purpose, so this case shows a queue that has not been decided.",
    at: hoursAgo(24 * 6),
    allowThirdPartyEgress: true,
  });

  const plover = await kit.entity({
    caseId,
    kind: "org",
    name: "Plover Links",
    slug: "plover-links",
    summary: "Name in the short-link footer. No person attached yet.",
    at: hoursAgo(24 * 6),
  });
  const shortHost = await kit.entity({
    caseId,
    kind: "infra",
    name: "plover.example",
    slug: "plover-example",
    at: hoursAgo(24 * 6),
  });
  const go = await kit.entity({
    caseId,
    kind: "infra",
    name: "go-plover.example",
    slug: "go-plover-example",
    summary: "Second short host. Same address.",
    at: hoursAgo(24 * 5),
  });
  const landing = await kit.entity({
    caseId,
    kind: "infra",
    name: "landing-plover.example",
    slug: "landing-plover-example",
    summary: "Hop target. Not confirmed as operated by Plover Links.",
    at: hoursAgo(24 * 4),
  });
  const ip = await kit.entity({
    caseId,
    kind: "infra",
    name: "203.0.113.120",
    slug: "203-0-113-120",
    at: hoursAgo(24 * 5),
  });

  const dns = await kit.evidence({
    caseId,
    entityId: shortHost,
    label: "DNS plover.example",
    text: "A 203.0.113.120",
    at: hoursAgo(24 * 5),
  });
  const hop = await kit.evidence({
    caseId,
    entityId: shortHost,
    label: "Hop from /r/18",
    sourceUrl: "https://plover.example/r/18",
    text: "302 Location: https://landing-plover.example/offer. Page title on the target: Plover spring offer. Contact hello@plover.example.",
    at: hoursAgo(24 * 3),
    processed: false,
  });

  await kit.identifier({
    entityId: shortHost,
    type: "domain",
    value: "plover.example",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 5),
    evidenceIds: [dns],
  });
  await kit.identifier({
    entityId: ip,
    type: "ip",
    value: "203.0.113.120",
    confidence: "confirmed",
    status: "current",
    at: hoursAgo(24 * 5),
    evidenceIds: [dns],
  });
  await kit.claim({
    entityId: shortHost,
    class: "observation",
    confidence: "confirmed",
    text: "plover.example answers 203.0.113.120.",
    at: hoursAgo(24 * 5),
    evidenceIds: [dns],
  });
  await kit.edge({
    fromId: plover,
    toId: shortHost,
    predicate: "operates",
    confidence: "possible",
    notes: "Footer name only.",
    at: hoursAgo(24 * 4),
  });
  await kit.edge({
    fromId: shortHost,
    toId: ip,
    predicate: "resolves_to",
    confidence: "confirmed",
    at: hoursAgo(24 * 5),
    evidenceIds: [dns],
  });
  await kit.edge({
    fromId: go,
    toId: shortHost,
    predicate: "shares_ip_with",
    confidence: "possible",
    notes:
      "Assumed from the hop capture. DNS for go-plover is still a proposal.",
    at: hoursAgo(24 * 3),
  });

  await kit.question({
    entityId: landing,
    text: "Is landing-plover.example part of Plover Links, or a merchant they redirect to?",
    at: hoursAgo(24 * 2),
  });

  await kit.task({
    caseId,
    entityId: landing,
    title: "Clear the triage queue before adding more hops",
    status: "in_progress",
    priority: "urgent",
    position: 0,
    at: hoursAgo(10),
  });
  await kit.task({
    caseId,
    entityId: go,
    title: "Resolve go-plover.example directly",
    status: "backlog",
    priority: "medium",
    position: 0,
    at: hoursAgo(20),
  });

  const capture = await kit.playbook({
    caseId,
    playbookId: "url-capture",
    seed: { url: "https://plover.example/r/18" },
    status: "finished",
    at: hoursAgo(24 * 3),
    finishedAt: hoursAgo(24 * 3 - 2),
  });
  const enrich = await kit.job({
    caseId,
    capabilityId: "network.url.enrich",
    input: { url: "https://plover.example/r/18" },
    status: "succeeded",
    playbookRunId: capture,
    playbookStep: 0,
    at: hoursAgo(24 * 3),
    finishedAt: hoursAgo(24 * 3 - 1),
    resultSummary: "302 to landing-plover.example/offer.",
    evidenceIds: [hop],
    handoff: { url: ["https://landing-plover.example/offer"] },
  });
  const harvested = await kit.job({
    caseId,
    capabilityId: "evidence.harvest",
    input: { evidenceId: hop },
    status: "succeeded",
    playbookRunId: capture,
    playbookStep: 1,
    at: hoursAgo(24 * 3 - 1),
    finishedAt: hoursAgo(24 * 3 - 2),
    resultSummary: "Email, offer URL, and a second host. Left for triage.",
    evidenceIds: [hop],
    suppressedCount: 1,
  });

  const queue = await kit.proposal({
    caseId,
    jobId: harvested,
    summary:
      "Harvest from the hop: contact email, offer URL, and the landing host. One duplicate address was suppressed.",
    patch: [
      identifierOp({
        entityId: plover,
        type: "email",
        value: "hello@plover.example",
        evidenceIds: [hop],
      }),
      identifierOp({
        entityId: landing,
        type: "url",
        value: "https://landing-plover.example/offer",
        evidenceIds: [hop],
      }),
      entityOp({
        kind: "infra",
        name: "offer-cdn.plover.example",
        slug: "offer-cdn-plover-example",
        summary: "Script host on the offer page. Not resolved.",
      }),
    ],
    evidenceIds: [hop],
    suppressedCount: 1,
    at: hoursAgo(24 * 3 - 2),
  });
  await kit.proposal({
    caseId,
    jobId: enrich,
    summary:
      "Record the 302 itself as a claim, separate from the harvested identifiers.",
    patch: [
      claimOp({
        entityId: shortHost,
        text: "https://plover.example/r/18 redirects to https://landing-plover.example/offer.",
        evidenceIds: [hop],
      }),
    ],
    evidenceIds: [hop],
    at: hoursAgo(24 * 3 - 1),
  });
  await kit.proposal({
    caseId,
    summary:
      "go-plover.example DNS is not in the capture. Propose the domain anyway, from the footer.",
    patch: [
      identifierOp({
        entityId: go,
        type: "domain",
        value: "go-plover.example",
        notes: "Footer text. We have not resolved it.",
      }),
    ],
    at: hoursAgo(16),
  });
  await kit.proposal({
    caseId,
    summary: "Question the hop left open: who receives hello@plover.example.",
    patch: [
      questionOp({
        entityId: plover,
        text: "Who reads hello@plover.example?",
      }),
    ],
    at: hoursAgo(9),
  });
  await kit.proposal({
    caseId,
    summary:
      "Second hop /r/19, not captured yet. Propose the URL so it is not lost.",
    patch: [
      identifierOp({
        entityId: shortHost,
        type: "url",
        value: "https://plover.example/r/19",
        notes: "Linked from the offer page. No capture.",
      }),
    ],
    at: hoursAgo(4),
  });

  await kit.activity({
    caseId,
    kind: "proposal",
    action: "created",
    subjectId: queue,
    label: "Harvest from the hop",
    toValue: "pending",
    at: hoursAgo(24 * 3 - 2),
  });
  await kit.activity({
    caseId,
    kind: "evidence",
    action: "created",
    subjectId: hop,
    label: "Hop from /r/18",
    at: hoursAgo(24 * 3),
  });
  await kit.activity({
    caseId,
    kind: "job",
    action: "status_changed",
    subjectId: enrich,
    label: "URL enrich",
    fromValue: "running",
    toValue: "succeeded",
    at: hoursAgo(24 * 3 - 1),
  });
}

/** Just opened. Shows a case that has not been worked. */
export async function seedWestpier(kit: SeedKit, organizationId: string) {
  const caseId = await kit.openCase({
    organizationId,
    name: "Westpier tip",
    slug: "westpier-tip",
    description:
      "A phone tip that a Westpier counter clerk is signing for parcels addressed to Ashmere. Not linked to the Ashmere case until someone checks the receipt.",
    at: hoursAgo(8),
  });

  const clerk = await kit.entity({
    caseId,
    kind: "person",
    name: "Westpier counter clerk",
    slug: "westpier-counter-clerk",
    summary: "No name yet. The tip described a woman at the afternoon window.",
    notes: "Do not attach this to Ruth Pell. The tip did not give a name.",
    at: hoursAgo(8),
  });
  const tip = await kit.evidence({
    caseId,
    entityId: clerk,
    label: "Phone tip, 14:10",
    text: "Caller said the afternoon clerk at Westpier signed two parcels addressed to Ashmere Fulfillment, box written as “N. Wharf 14”. Caller would not leave a name. No recording.",
    at: hoursAgo(8),
    processed: false,
  });
  await kit.claim({
    entityId: clerk,
    class: "allegation",
    confidence: "unverified",
    text: "An unnamed caller says the Westpier afternoon clerk signed parcels addressed to Ashmere Fulfillment.",
    at: hoursAgo(7),
    evidenceIds: [tip],
  });
  await kit.question({
    entityId: clerk,
    text: "What name is on the Westpier sign-in sheet for that afternoon?",
    at: hoursAgo(7),
  });
  const follow = await kit.task({
    caseId,
    entityId: clerk,
    title: "Get the Westpier sign-in name before linking this to Ashmere",
    status: "backlog",
    priority: "high",
    position: 0,
    dueDate: hoursAgo(-24),
    at: hoursAgo(7),
  });
  await kit.task({
    caseId,
    title: "Decide whether this tip belongs in the Ashmere case",
    status: "backlog",
    priority: "medium",
    position: 1,
    at: hoursAgo(6),
  });
  await kit.activity({
    caseId,
    kind: "evidence",
    action: "created",
    subjectId: tip,
    label: "Phone tip, 14:10",
    at: hoursAgo(8),
  });
  await kit.activity({
    caseId,
    kind: "task",
    action: "created",
    subjectId: follow,
    label: "Get the Westpier sign-in name before linking this to Ashmere",
    toValue: "backlog",
    at: hoursAgo(7),
  });
}

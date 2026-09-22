/**
 * Screenshot seed for the local Case Graph.
 * Run: just seed-demo
 * Replace: just seed-demo --force
 *
 * Uses the earliest organization owner (or first member). Does not create
 * a user. Values are fictional: `.example` names and documentation addresses.
 * Jobs are finished, failed, or cancelled so a running worker will not pick
 * them up.
 */
import { asc, eq, inArray } from "drizzle-orm";

import { cases, client, db, member, organization, user } from "@watchdog/db";

import { seedAshmere } from "./ashmere";
import { DEMO_CASE_SLUGS } from "./slugs";
import {
  seedBrine,
  seedHalden,
  seedKeel,
  seedPlover,
  seedWestpier,
} from "./supporting-cases";
import { emptyTally, SeedKit } from "./write";

class AlreadySeededError extends Error {
  readonly slugs: string[];

  constructor(slugs: string[]) {
    super(`demo cases already exist: ${slugs.join(", ")}`);
    this.name = "AlreadySeededError";
    this.slugs = slugs;
  }
}

async function resolveActor(): Promise<{
  organizationId: string;
  organizationName: string;
  userId: string;
  userName: string;
}> {
  const rows = await db
    .select({
      organizationId: member.organizationId,
      organizationName: organization.name,
      userId: user.id,
      userName: user.name,
      role: member.role,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .orderBy(asc(member.createdAt));

  const owner = rows.find((row) => row.role === "owner") ?? rows[0];
  if (owner === undefined) {
    throw new Error(
      "No organization member found. Sign up once (BETTER_AUTH_ALLOW_SIGNUP=1), then rerun just seed-demo."
    );
  }
  return owner;
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const actor = await resolveActor();
  const tally = emptyTally();

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ slug: cases.slug })
      .from(cases)
      .where(inArray(cases.slug, [...DEMO_CASE_SLUGS]));

    if (existing.length > 0 && !force) {
      throw new AlreadySeededError(existing.map((row) => row.slug));
    }
    if (existing.length > 0) {
      await tx.delete(cases).where(inArray(cases.slug, [...DEMO_CASE_SLUGS]));
    }

    const kit = new SeedKit(tx, actor.userId, tally);
    await seedAshmere(kit, actor.organizationId);
    await seedBrine(kit, actor.organizationId);
    await seedHalden(kit, actor.organizationId);
    await seedKeel(kit, actor.organizationId);
    await seedPlover(kit, actor.organizationId);
    await seedWestpier(kit, actor.organizationId);
  });

  console.log(
    `Seeded demo cases into ${actor.organizationName} as ${actor.userName}.`
  );
  console.log(
    [
      `${tally.cases} cases`,
      `${tally.entities} entities`,
      `${tally.identifiers} identifiers`,
      `${tally.claims} claims`,
      `${tally.edges} edges`,
      `${tally.evidence} evidence`,
      `${tally.events} events`,
      `${tally.questions} questions`,
      `${tally.tasks} tasks`,
      `${tally.jobs} jobs`,
      `${tally.proposals} proposals`,
      `${tally.activity} activity rows`,
    ].join(", ")
  );
  console.log("");
  console.log("Open Ashmere parcel desk for the graph, dossier, and tasks.");
  console.log(
    "Open Plover short links for a triage queue that is still pending."
  );
  console.log("Slugs:");
  for (const slug of DEMO_CASE_SLUGS) {
    console.log(`  ${slug}`);
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof AlreadySeededError) {
    console.error(error.message);
    console.error("Re-run with --force to replace them.");
  } else {
    console.error(error);
  }
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}

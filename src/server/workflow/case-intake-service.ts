import { ingestionRecordings } from "@/server/db/wc017-device-recordings-schema";
import "server-only";

import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { checkOperationalAccess } from "@/server/authorization/operational-access";
import { getDb } from "@/server/db";
import { userAccess } from "@/server/db/access-schema";
import { roleGrants } from "@/server/db/grants-schema";
import {
  caseObservationLinks,
  domainCases,
  observationSources,
  observations,
} from "@/server/db/observation-domain-schema";
import { CaseIntakeFailure, parseCaseIntakeInput } from "./case-intake-policy";

/** Human-originated observation -> Case Received + immutable linkage intent.
 * No AI confidence, incident confirmation or proposed workflow transition.
 * The observation FOR UPDATE lock serializes duplicate concurrent intake.
 */
export async function createReviewCase(raw: unknown) {
  const input = parseCaseIntakeInput(raw);
  const access = await checkOperationalAccess(input.organizationId, "operator");
  if (!access.allowed)
    throw new CaseIntakeFailure(access.status, access.reason);

  return getDb().transaction(async (tx) => {
    const [account] = await tx
      .select({ status: userAccess.status })
      .from(userAccess)
      .where(eq(userAccess.userId, access.userId))
      .for("share")
      .limit(1);
    const [grant] = await tx
      .select({ id: roleGrants.id })
      .from(roleGrants)
      .where(
        and(
          eq(roleGrants.userId, access.userId),
          eq(roleGrants.organizationId, input.organizationId),
          eq(roleGrants.role, "operator"),
          isNull(roleGrants.revokedAt),
        ),
      )
      .for("share")
      .limit(1);
    if (account?.status !== "active" || !grant) {
      throw new CaseIntakeFailure(403, "ROLE_OR_SCOPE_DENIED");
    }

    const [observation] = await tx
      .select({
        id: observations.id,
        quality: observations.quality,
        sourceKind: observationSources.kind,
      })
      .from(observations)
      .innerJoin(
        observationSources,
        and(
          eq(observations.sourceId, observationSources.id),
          eq(observations.organizationId, observationSources.organizationId),
        ),
      )
      .where(
        and(
          eq(observations.id, input.observationId),
          eq(observations.organizationId, input.organizationId),
          inArray(observationSources.kind, ["manual", "listen_device"]),
          eq(observationSources.isActive, true),
          ne(observationSources.code, "WC009-MANUAL-DEV"),
        ),
      )
      .for("update")
      .limit(1);
    if (!observation) throw new CaseIntakeFailure(404, "OBSERVATION_NOT_FOUND");
    // A LISTEN Case must point to an actual committed WC-017 receipt.
    if (observation.sourceKind === "listen_device") {
      const [receipt] = await tx
        .select({ id: ingestionRecordings.id })
        .from(ingestionRecordings)
        .where(
          and(
            eq(ingestionRecordings.organizationId, input.organizationId),
            eq(ingestionRecordings.observationId, observation.id),
          ),
        )
        .limit(1);
      if (!receipt)
        throw new CaseIntakeFailure(422, "DEVICE_AUDIO_RECEIPT_REQUIRED");
    }
    if (observation.quality === "invalid")
      throw new CaseIntakeFailure(
        422,
        "INVALID_OBSERVATION_CANNOT_START_REVIEW",
      );

    const [existing] = await tx
      .select({
        caseId: caseObservationLinks.caseId,
        reason: caseObservationLinks.linkReason,
        openedBy: domainCases.openedByUserId,
        title: domainCases.title,
        status: domainCases.status,
      })
      .from(caseObservationLinks)
      .innerJoin(
        domainCases,
        and(
          eq(caseObservationLinks.caseId, domainCases.id),
          eq(caseObservationLinks.organizationId, domainCases.organizationId),
        ),
      )
      .where(
        and(
          eq(caseObservationLinks.organizationId, input.organizationId),
          eq(caseObservationLinks.observationId, input.observationId),
          isNull(caseObservationLinks.unlinkedAt),
        ),
      )
      .limit(1);
    if (existing) {
      if (
        existing.openedBy === access.userId &&
        existing.title === input.title &&
        existing.reason === input.reason
      ) {
        return {
          caseId: existing.caseId,
          status: existing.status,
          replayed: true,
        };
      }
      throw new CaseIntakeFailure(409, "OBSERVATION_ALREADY_LINKED_TO_CASE");
    }

    const [created] = await tx
      .insert(domainCases)
      .values({
        organizationId: input.organizationId,
        title: input.title,
        openedByUserId: access.userId,
        // status = 'received' and version = 1 from DB defaults.
      })
      .returning({ id: domainCases.id });
    if (!created) throw new CaseIntakeFailure(500, "CASE_INTAKE_FAILED");
    await tx.insert(caseObservationLinks).values({
      organizationId: input.organizationId,
      caseId: created.id,
      observationId: observation.id,
      linkedByUserId: access.userId,
      linkReason: input.reason,
    });
    return { caseId: created.id, status: "received" as const, replayed: false };
  });
}

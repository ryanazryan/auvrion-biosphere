import { and, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { CaseIntakeForm } from "@/components/supervisor/CaseIntakeForm";
import { PageHeading, Panel } from "@/components/supervisor/SupervisorElements";
import { OperatorLayout } from "@/figma-operator/components/operator/OperatorLayout";
import { getDb } from "@/server/db";
import {
  caseObservationLinks,
  observationSources,
  observations,
} from "@/server/db/observation-domain-schema";
import { findWorkspaceAccess } from "@/server/workflow/workspace-queries";

export const dynamic = "force-dynamic";
/** Show only server-scoped, unlinked observations. SQL is a hint, service revalidates in transaction. */
export default async function NewReviewCasePage() {
  const access = await findWorkspaceAccess("operator");
  if (!access.allowed) return null;
  const choices = await getDb()
    .select({
      id: observations.id,
      sourceCode: observationSources.code,
      domain: observations.domain,
      quality: observations.quality,
      receivedAt: observations.receivedAt,
    })
    .from(observations)
    .innerJoin(
      observationSources,
      and(
        eq(observationSources.id, observations.sourceId),
        eq(observationSources.organizationId, observations.organizationId),
      ),
    )
    .leftJoin(
      caseObservationLinks,
      and(
        eq(caseObservationLinks.observationId, observations.id),
        eq(caseObservationLinks.organizationId, observations.organizationId),
        isNull(caseObservationLinks.unlinkedAt),
      ),
    )
    .where(
      and(
        eq(observations.organizationId, access.organizationId),
        eq(observationSources.kind, "manual"),
        isNull(caseObservationLinks.id),
      ),
    )
    .orderBy(desc(observations.receivedAt))
    .limit(50);
  const eligible = choices.filter((o) => o.quality !== "invalid");
  return (
    <OperatorLayout
      path="/operator/review"
      crumbs={[
        { label: "Antrean Review", href: "/operator/review" },
        { label: "Buat Case" },
      ]}
    >
      <Link
        href="/operator/review"
        className="mb-4 inline-block text-xs font-semibold text-brand"
      >
        ← Kembali ke antrean review
      </Link>
      <PageHeading
        title="Buat Case dari observasi"
        desc="Hubungkan satu observasi manual ke Case Received. Pemeriksaan Operator dan keputusan Supervisor dilakukan sebagai langkah terpisah."
      />
      <div className="max-w-2xl">
        <Panel title="Intake Case">
          <div className="p-4 sm:p-5">
            <CaseIntakeForm
              organizationId={access.organizationId}
              observations={eligible.map((o) => ({
                ...o,
                receivedAt: o.receivedAt.toISOString(),
              }))}
            />
          </div>
        </Panel>
      </div>
    </OperatorLayout>
  );
}

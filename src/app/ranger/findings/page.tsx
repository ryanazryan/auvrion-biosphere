import Link from "next/link";
import { RangerIcon } from "@/components/ranger/RangerIcons";
import { EmptyState, Heading, InfoCard } from "@/components/ranger/RangerViews";
import { findRangerWorkspaceAccess } from "@/server/ranger/ranger-workspace";

export const dynamic = "force-dynamic";
export default async function RangerFindings() {
  const access = await findRangerWorkspaceAccess();
  if (!access.allowed) return null;
  return (
    <>
      <Heading title="Temuan" />
      <InfoCard
        title="Temuan Lapangan"
        icon={<RangerIcon name="notebook" className="size-4 text-muted" />}
      >
        <EmptyState
          title="Belum ada temuan tersimpan"
          text="Pencatatan temuan tersedia setelah workflow dan evidence disetujui."
          action={
            <Link
              href="/ranger/tasks"
              className="inline-flex min-h-9 items-center rounded-md border border-line px-3 text-xs font-medium text-brand hover:bg-brand-50"
            >
              Buka Tugas Saya
            </Link>
          }
        />
      </InfoCard>
    </>
  );
}

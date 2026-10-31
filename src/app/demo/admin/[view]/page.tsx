import { notFound } from "next/navigation";
import type { ComponentProps } from "react";
import { AdminEnvironmentMap } from "@/components/admin/AdminEnvironmentMap";
import { AccessApplicationsWorkspace } from "@/components/admin/access-applications-workspace";
import { AccessUsersWorkspace } from "@/components/admin/access-users-workspace";
import { AdminShell } from "@/components/admin/admin-shell";
import { DeviceAdminFrame } from "@/components/admin/DeviceAdminFrame";
import { DeviceFleetPanel } from "@/components/admin/DeviceFleetPanel";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Simulasi Admin | Auvrion Biosphere",
  robots: { index: false, follow: false },
};

const organizationName = "Auvrion Biosphere • Simulasi";
const adminEmail = "reviewer@demo.invalid";
const demoApplications = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    applicantName: "Pemohon Demo A",
    email: "operator@example.invalid",
    status: "email_verified",
    createdAt: "2026-10-30T02:15:00.000Z",
    emailVerifiedAt: "2026-10-30T02:25:00.000Z",
    reviewedAt: null,
    decisionReason: null,
    accessStatus: null,
    invitationUsedAt: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    applicantName: "Pemohon Demo B",
    email: "ranger@example.invalid",
    status: "approved",
    createdAt: "2026-10-29T04:30:00.000Z",
    emailVerifiedAt: "2026-10-29T04:40:00.000Z",
    reviewedAt: "2026-10-29T06:40:00.000Z",
    decisionReason: "Disetujui untuk simulasi",
    accessStatus: "pending_activation",
    invitationUsedAt: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    applicantName: "Pemohon Demo C",
    email: "supervisor@example.invalid",
    status: "approved",
    createdAt: "2026-10-28T07:00:00.000Z",
    emailVerifiedAt: "2026-10-28T07:05:00.000Z",
    reviewedAt: "2026-10-28T09:30:00.000Z",
    decisionReason: "Disetujui untuk simulasi",
    accessStatus: "active",
    invitationUsedAt: "2026-10-28T10:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    applicantName: "Pemohon Demo D",
    email: "guest@example.invalid",
    status: "submitted",
    createdAt: "2026-10-30T12:00:00.000Z",
    emailVerifiedAt: null,
    reviewedAt: null,
    decisionReason: null,
    accessStatus: null,
    invitationUsedAt: null,
  },
] satisfies ComponentProps<typeof AccessApplicationsWorkspace>["records"];

const demoUsers = [
  {
    userId: "00000000-0000-4000-8000-000000000011",
    name: "Operator Demo",
    email: "operator@example.invalid",
    accessStatus: "active",
    activeRoles: ["operator"],
    lastLifecycleAuditId: null,
    protectedAdmin: false,
    mfaEnabled: true,
  },
  {
    userId: "00000000-0000-4000-8000-000000000012",
    name: "Ranger Demo",
    email: "ranger@example.invalid",
    accessStatus: "active",
    activeRoles: ["ranger"],
    lastLifecycleAuditId: null,
    protectedAdmin: false,
    mfaEnabled: true,
  },
  {
    userId: "00000000-0000-4000-8000-000000000013",
    name: "Supervisor Demo",
    email: "supervisor@example.invalid",
    accessStatus: "active",
    activeRoles: ["supervisor"],
    lastLifecycleAuditId: null,
    protectedAdmin: false,
    mfaEnabled: true,
  },
] satisfies ComponentProps<typeof AccessUsersWorkspace>["users"];

const demoAudit = [
  {
    id: "00000000-0000-4000-8000-000000000021",
    action: "role_granted",
    targetUserId: "00000000-0000-4000-8000-000000000011",
    reason: "Data sintetis: demonstrasi pemberian role Operator",
    createdAt: "2026-10-29T09:00:00.000Z",
  },
] satisfies ComponentProps<typeof AccessUsersWorkspace>["audit"];

type Params = { params: Promise<{ view: string }> };
export default async function JudgeAdminDemoView({ params }: Params) {
  const { view } = await params;
  if (view === "access-applications")
    return (
      <AccessApplicationsWorkspace
        demoMode
        records={demoApplications}
        organizationName={organizationName}
        adminEmail={adminEmail}
      />
    );
  if (view === "access-users")
    return (
      <AccessUsersWorkspace
        demoMode
        users={demoUsers}
        audit={demoAudit}
        organizationName={organizationName}
        adminEmail={adminEmail}
      />
    );
  if (view === "devices")
    return (
      <DeviceAdminFrame demo pageName="Perangkat IoT">
        <DeviceFleetPanel demo />
      </DeviceAdminFrame>
    );
  if (view === "map")
    return (
      <DeviceAdminFrame demo pageName="Peta lingkungan">
        <AdminEnvironmentMap demo />
      </DeviceAdminFrame>
    );
  if (view === "security")
    return (
      <AdminShell
        demo
        organizationName={organizationName}
        adminEmail={adminEmail}
      >
        <div className="rounded-lg border border-line bg-white p-7">
          <h1 className="text-2xl font-semibold">Keamanan Admin</h1>
          <p className="mt-3 text-sm text-muted">
            Demonstrasi ini tidak mengelola sesi, recovery code, atau MFA
            sungguhan. Halaman keamanan akun asli hanya tersedia untuk akun yang
            disetujui.
          </p>
        </div>
      </AdminShell>
    );
  notFound();
}

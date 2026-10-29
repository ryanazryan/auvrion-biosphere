import { redirect } from "next/navigation";

/** Prevent old Admin back links from navigating to a missing route. */
export default function AdminIndexPage() {
  redirect("/admin/devices");
}

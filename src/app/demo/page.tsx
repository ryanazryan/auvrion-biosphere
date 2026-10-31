import { redirect } from "next/navigation";

/** Public demo is embedded in the public landing page. */
export default function DemoPage() {
  redirect("/landing#webgis");
}

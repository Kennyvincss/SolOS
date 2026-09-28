import { redirect } from "next/navigation";

/** The Workspace (built-in tools) was removed; extensions live on /extensions. */
export default function WorkspacePage() {
  redirect("/extensions");
}

import { redirect } from "next/navigation";

/** Old links to built-in STRATA tools go to the Extensions page. */
export default function ExtensionPage() {
  redirect("/extensions");
}

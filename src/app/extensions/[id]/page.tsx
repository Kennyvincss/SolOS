import { redirect } from "next/navigation";

/** Old links to built-in Solana OS tools go to the Extensions page. */
export default function ExtensionPage() {
  redirect("/extensions");
}

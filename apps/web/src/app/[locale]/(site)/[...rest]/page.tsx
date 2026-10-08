import { notFound } from "next/navigation";

// Unknown paths under a locale: show the localized not-found page inside the site shell.
export default function CatchAll() {
  notFound();
}

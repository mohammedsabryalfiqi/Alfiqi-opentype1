import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import FontFreezer from "@/components/FontFreezer";
import { trackVisit } from "@/lib/tracking";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  useEffect(() => {
    trackVisit("/");
  }, []);
  return <FontFreezer />;
}

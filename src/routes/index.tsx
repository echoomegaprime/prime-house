import { createFileRoute } from "@tanstack/react-router";
import { Deck } from "@/components/prime/deck";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <Deck />;
}

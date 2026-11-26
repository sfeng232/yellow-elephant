import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { PlayerScreen } from "./player-screen";

export default function PlayPage({ params }: PageProps<"/play/[code]">) {
  return (
    <Suspense fallback={<Spinner />}>
      <PlayerScreen params={params} />
    </Suspense>
  );
}

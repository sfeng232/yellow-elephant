import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { HostLobby } from "./host-lobby";

export default function HostPage({ params }: PageProps<"/host/[code]">) {
  return (
    <Suspense fallback={<Spinner />}>
      <HostLobby params={params} />
    </Suspense>
  );
}

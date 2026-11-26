import type { Metadata } from "next";
import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { TvScreen } from "./tv-screen";

export const metadata: Metadata = { title: "White Elephant · TV" };

export default function ScreenPage({ params }: PageProps<"/screen/[code]">) {
  return (
    <Suspense fallback={<Spinner />}>
      <TvScreen params={params} />
    </Suspense>
  );
}

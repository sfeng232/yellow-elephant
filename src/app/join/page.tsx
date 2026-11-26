import { Suspense } from "react";
import { Spinner } from "@/components/ui";
import { JoinForm } from "./join-form";

export default function JoinPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <JoinForm />
    </Suspense>
  );
}

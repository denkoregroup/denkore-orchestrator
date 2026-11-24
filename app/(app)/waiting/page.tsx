import type { Metadata } from "next";
import { WaitingBoard } from "@/components/waiting/waiting-board";
import { getWaiting } from "@/lib/data/waiting";

export const metadata: Metadata = { title: "Waiting on you · Denkore" };

export default async function WaitingPage() {
  const data = await getWaiting();
  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Waiting on you</h1>
      <p className="text-muted">Open pull requests across your projects, read from GitHub when you open this page.</p>
      <WaitingBoard data={data} />
    </section>
  );
}

import type { Metadata } from "next";
import { listProjects } from "@/lib/data/projects";
import { PromptForm } from "./prompt-form";

export const metadata: Metadata = { title: "Prompt · Denkore" };

export default async function PromptPage() {
  const projects = await listProjects();

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Start a run</h1>
      {projects.length === 0 ? (
        <div className="space-y-2 rounded-lg border border-border p-4">
          <p>There are no projects yet.</p>
          <p className="text-muted">
            Add your projects by running <code className="font-mono">pnpm registry:sync</code>, then
            reload this page.
          </p>
        </div>
      ) : (
        <PromptForm projects={projects.map((p) => ({ id: p.id, label: `${p.registry_id} (${p.repo})` }))} />
      )}
    </section>
  );
}

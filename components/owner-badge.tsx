import { requireOwner } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

export async function OwnerBadge() {
  const owner = await requireOwner();
  return (
    <form action={signOut} className="flex items-center gap-3 text-sm">
      <span className="truncate text-muted">{owner.email ?? "Owner"}</span>
      <button type="submit" className="min-h-10 rounded-md border border-border px-3">
        Sign out
      </button>
    </form>
  );
}

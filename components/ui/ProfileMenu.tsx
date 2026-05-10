"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ProfileMenuProps {
  displayName: string;
  email: string;
}

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return (
    <div className="w-9 h-9 rounded-lg bg-studyrank-purple/20 border border-studyrank-purple/30 flex items-center justify-center">
      <span className="text-studyrank-purple text-xs font-semibold">{initials}</span>
    </div>
  );
}

export function ProfileMenu({ displayName, email }: ProfileMenuProps) {
  const router = useRouter();
  const supabase = createClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(displayName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditing(false);
        setError(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleSaveName() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error: err } = await supabase
        .from("profiles")
        .update({ display_name: trimmed })
        .eq("id", user.id);
      if (err) {
        setError("Failed to save. Try again.");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => { setOpen((o) => !o); setEditing(false); setError(null); }}
        className="focus:outline-none focus-visible:ring-2 focus-visible:ring-studyrank-purple/60 rounded-lg"
        aria-label="Open profile menu"
      >
        <Avatar name={name || displayName} />
      </button>

      {open && (
        <div className="absolute right-0 top-11 w-64 bg-studyrank-card border border-studyrank-border rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-studyrank-border">
            <p className="text-studyrank-primary text-sm font-semibold truncate">
              {name || displayName}
            </p>
            <p className="text-studyrank-muted text-xs truncate">{email}</p>
          </div>

          {/* Edit name */}
          <div className="px-4 py-3 border-b border-studyrank-border">
            {editing ? (
              <div className="flex flex-col gap-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") { setEditing(false); setName(displayName); }
                  }}
                  className="w-full bg-studyrank-surface border border-studyrank-border rounded-md px-3 py-2 text-studyrank-primary text-sm focus:outline-none focus:border-studyrank-purple"
                  placeholder="Display name"
                />
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveName}
                    disabled={saving}
                    className="flex-1 bg-studyrank-purple text-studyrank-primary text-xs font-semibold uppercase tracking-widest rounded-md py-1.5 hover:bg-[#5a52c0] disabled:opacity-50 transition-colors"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => { setEditing(false); setName(displayName); setError(null); }}
                    className="flex-1 bg-studyrank-surface border border-studyrank-border text-studyrank-secondary text-xs font-semibold uppercase tracking-widest rounded-md py-1.5 hover:bg-studyrank-base transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="w-full text-left text-studyrank-secondary text-sm hover:text-studyrank-primary transition-colors py-0.5"
              >
                Edit display name
              </button>
            )}
          </div>

          {/* Log out */}
          <div className="px-4 py-3">
            <button
              onClick={handleLogout}
              className="w-full text-left text-red-400 text-sm hover:text-red-300 transition-colors py-0.5"
            >
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

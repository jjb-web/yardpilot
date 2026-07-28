import { useMemo, useState } from "react";
import {
  Check,
  Clipboard,
  Copy,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type {
  JobRequest,
  WorkspaceRole,
} from "../data/types";

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 11);
}

function toLocalInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function Team() {
  const {
    authUserId,
    activeWorkspace,
    activeWorkspaceId,
    role,
    workspaces,
    workspaceMembers,
    workspaceInvites,
    workspaceError,
    jobRequests,
    jobRequestsLoading,
    switchWorkspace,
    createWorkspaceInvite,
    revokeWorkspaceInvite,
    acceptWorkspaceInvite,
    updateWorkspaceMemberRole,
    removeWorkspaceMember,
    addJobRequest,
    approveJobRequest,
    declineJobRequest,
    deleteJobRequest,
  } = useApp();

  const manager = role === "owner" || role === "partner";
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"partner" | "employee">("employee");
  const [joinCode, setJoinCode] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestDraft, setRequestDraft] = useState({
    title: "",
    client: "",
    address: "",
    scopeDescription: "",
    proposedStart: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const pendingInvites = workspaceInvites.filter((invite) => invite.status === "pending");
  const pendingRequests = useMemo(
    () => jobRequests.filter((request) => request.status === "pending"),
    [jobRequests]
  );

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30";
  const labelClass =
    "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

  async function createInvite() {
    setError("");
    setMessage("");
    if (!inviteEmail.trim()) {
      setError("Enter the email address you want to invite.");
      return;
    }
    setSaving(true);
    try {
      const invite = await createWorkspaceInvite(inviteEmail, inviteRole);
      await navigator.clipboard.writeText(invite.token).catch(() => undefined);
      setMessage(`Invite created. The code ${invite.token} was copied.`);
      setInviteEmail("");
      setInviteOpen(false);
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Could not create invite.");
    } finally {
      setSaving(false);
    }
  }

  async function joinWorkspace() {
    setError("");
    setMessage("");
    if (!joinCode.trim()) {
      setError("Paste an invite code first.");
      return;
    }
    setSaving(true);
    try {
      await acceptWorkspaceInvite(joinCode);
      setJoinCode("");
      setMessage("Workspace joined successfully.");
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not accept invite.");
    } finally {
      setSaving(false);
    }
  }

  async function copyInvite(token: string) {
    await navigator.clipboard.writeText(token);
    setMessage("Invite code copied.");
  }

  async function changeRole(membershipId: string, nextRole: Exclude<WorkspaceRole, "owner">) {
    setError("");
    try {
      await updateWorkspaceMemberRole(membershipId, nextRole);
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : "Could not update member role.");
    }
  }

  async function removeMember(id: string, name: string) {
    if (!window.confirm(`Remove ${name} from this workspace?`)) return;
    try {
      await removeWorkspaceMember(id);
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove member.");
    }
  }

  async function createJobRequest() {
    setError("");
    if (!requestDraft.title.trim()) {
      setError("Enter a job title.");
      return;
    }
    if (!authUserId || !activeWorkspaceId) {
      setError("Workspace is still loading.");
      return;
    }
    setSaving(true);
    const now = new Date().toISOString();
    try {
      await addJobRequest({
        id: uid(),
        workspaceId: activeWorkspaceId,
        requestedBy: authUserId,
        requestedByName: "",
        title: requestDraft.title.trim(),
        client: requestDraft.client.trim(),
        address: requestDraft.address.trim(),
        scopeDescription: requestDraft.scopeDescription.trim(),
        proposedStart: requestDraft.proposedStart
          ? new Date(requestDraft.proposedStart).toISOString()
          : null,
        status: "pending",
        managerNotes: "",
        createdProjectId: null,
        createdAt: now,
        updatedAt: now,
      });
      setRequestOpen(false);
      setRequestDraft({
        title: "",
        client: "",
        address: "",
        scopeDescription: "",
        proposedStart: "",
      });
      setMessage("Job proposal sent to the owner/partners.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create job request.");
    } finally {
      setSaving(false);
    }
  }

  async function approveRequest(request: JobRequest) {
    setError("");
    try {
      await approveJobRequest(request.id);
      setMessage(`${request.title} was approved and added as a job.`);
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "Could not approve job request.");
    }
  }

  async function declineRequest(request: JobRequest) {
    const notes = window.prompt("Optional note for the employee:", "") ?? "";
    try {
      await declineJobRequest(request.id, notes);
      setMessage(`${request.title} was declined.`);
    } catch (declineError) {
      setError(declineError instanceof Error ? declineError.message : "Could not decline job request.");
    }
  }

  async function removeRequest(request: JobRequest) {
    if (!window.confirm("Delete this job proposal?")) return;
    try {
      await deleteJobRequest(request.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete request.");
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team</h1>
          <p className="text-sm text-gray-500 mt-1">
            Partners share the full dashboard. Employees see assigned work, their schedule, and non-financial job details.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRequestOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 cursor-pointer"
          >
            <Clipboard size={16} /> Propose Job
          </button>
          {manager && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-700 text-white text-sm font-semibold cursor-pointer"
            >
              <UserPlus size={16} /> Add Partner / Employee
            </button>
          )}
        </div>
      </div>

      {(workspaceError || error) && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || workspaceError}
        </div>
      )}
      {message && (
        <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 mb-6">
        <section className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Users size={17} className="text-green-700" />
            <h2 className="font-bold text-gray-900">Workspace Members</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {workspaceMembers.map((member) => (
              <div key={member.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold shrink-0">
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900 truncate">{member.name}</p>
                    {member.userId === authUserId && (
                      <span className="text-xs text-gray-400">You</span>
                    )}
                    {member.role === "owner" && (
                      <ShieldCheck size={14} className="text-green-700" />
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">{member.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {manager && member.role !== "owner" && member.userId !== authUserId ? (
                    <select
                      value={member.role}
                      onChange={(event) =>
                        void changeRole(
                          member.id,
                          event.target.value as "partner" | "employee"
                        )
                      }
                      className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm capitalize"
                    >
                      <option value="partner">Partner</option>
                      <option value="employee">Employee</option>
                    </select>
                  ) : (
                    <span className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold capitalize">
                      {member.role}
                    </span>
                  )}
                  {manager && member.role !== "owner" && member.userId !== authUserId && (
                    <button
                      type="button"
                      onClick={() => void removeMember(member.id, member.name)}
                      className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-5">
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-3">Active Workspace</h2>
            <select
              value={activeWorkspaceId ?? ""}
              onChange={(event) => void switchWorkspace(event.target.value)}
              className={inputClass}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name} — {workspace.role}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-2">
              Current role: <span className="capitalize font-semibold">{role ?? "loading"}</span>
            </p>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-3">Join a Workspace</h2>
            <p className="text-sm text-gray-500 mb-3">
              Paste the invite code sent by an owner or partner. You must be signed in with the invited email.
            </p>
            <div className="space-y-2">
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="Invite code"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => void joinWorkspace()}
                disabled={saving}
                className="w-full px-4 py-2.5 rounded-lg bg-green-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                Join Workspace
              </button>
            </div>
          </section>
        </div>
      </div>

      {manager && (
        <section className="bg-white rounded-xl border border-gray-200 mb-6">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Pending Invites</h2>
            <span className="text-sm text-gray-400">{pendingInvites.length}</span>
          </div>
          {pendingInvites.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">No pending invites.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="px-5 py-4 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{invite.email}</p>
                    <p className="text-xs text-gray-400 capitalize">
                      {invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString("en-US")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyInvite(invite.token)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 cursor-pointer"
                  >
                    <Copy size={14} /> Copy Code
                  </button>
                  <button
                    type="button"
                    onClick={() => void revokeWorkspaceInvite(invite.id)}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-red-600 cursor-pointer"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900">Job Proposals</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Employees can propose jobs. Owners and partners approve them before they become real jobs.
            </p>
          </div>
          <span className="text-sm text-gray-400">{pendingRequests.length} pending</span>
        </div>

        {jobRequestsLoading ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">Loading proposals...</div>
        ) : jobRequests.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">No job proposals yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {jobRequests.map((request) => (
              <div key={request.id} className="px-5 py-5 flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900">{request.title}</p>
                    <span className={`text-xs font-semibold capitalize px-2 py-1 rounded-full ${
                      request.status === "approved"
                        ? "bg-green-100 text-green-700"
                        : request.status === "declined"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                    }`}>
                      {request.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Proposed by {request.requestedByName}
                    {request.client ? ` · ${request.client}` : ""}
                  </p>
                  {request.address && <p className="text-sm text-gray-400 mt-1">{request.address}</p>}
                  {request.scopeDescription && (
                    <p className="text-sm text-gray-600 mt-2">{request.scopeDescription}</p>
                  )}
                  {request.proposedStart && (
                    <p className="text-xs text-gray-400 mt-2">
                      Proposed start: {new Date(request.proposedStart).toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  )}
                  {request.managerNotes && (
                    <p className="text-xs text-red-600 mt-2">Manager note: {request.managerNotes}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {manager && request.status === "pending" && (
                    <>
                      <button
                        type="button"
                        onClick={() => void approveRequest(request)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold cursor-pointer"
                      >
                        <Check size={15} /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void declineRequest(request)}
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-red-600 cursor-pointer"
                      >
                        Decline
                      </button>
                    </>
                  )}
                  {(request.requestedBy === authUserId || manager) && request.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => void removeRequest(request)}
                      className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {inviteOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Add Partner or Employee</h2>
              <button type="button" onClick={() => setInviteOpen(false)} className="text-gray-400 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className={labelClass}>Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Access Level</label>
                <select
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value as "partner" | "employee")}
                  className={inputClass}
                >
                  <option value="employee">Employee — assigned jobs and schedule only</option>
                  <option value="partner">Partner — full shared dashboard</option>
                </select>
              </div>
              <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-500">
                The person will receive an invite code from you. They sign in with this exact email, open Team, and paste the code.
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button type="button" onClick={() => setInviteOpen(false)} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 cursor-pointer">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void createInvite()}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                Create Invite
              </button>
            </div>
          </div>
        </div>
      )}

      {requestOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Propose a Job</h2>
              <button type="button" onClick={() => setRequestOpen(false)} className="text-gray-400 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelClass}>Job Title</label>
                <input
                  value={requestDraft.title}
                  onChange={(event) => setRequestDraft((current) => ({ ...current, title: event.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Customer</label>
                <input
                  value={requestDraft.client}
                  onChange={(event) => setRequestDraft((current) => ({ ...current, client: event.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Proposed Start</label>
                <input
                  type="datetime-local"
                  value={requestDraft.proposedStart}
                  onChange={(event) => setRequestDraft((current) => ({ ...current, proposedStart: event.target.value }))}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Address</label>
                <input
                  value={requestDraft.address}
                  onChange={(event) => setRequestDraft((current) => ({ ...current, address: event.target.value }))}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Scope / Description</label>
                <textarea
                  rows={4}
                  value={requestDraft.scopeDescription}
                  onChange={(event) => setRequestDraft((current) => ({ ...current, scopeDescription: event.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button type="button" onClick={() => setRequestOpen(false)} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 cursor-pointer">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void createJobRequest()}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                Send Proposal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

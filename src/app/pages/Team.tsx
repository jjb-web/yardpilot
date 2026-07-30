import { useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  Check,
  Clipboard,
  Copy,
  Edit3,
  LogOut,
  Mail,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import CopyToast from "../components/CopyToast";
import { useCopyFeedback } from "../hooks/useCopyFeedback";
import type {
  JobRequest,
  WorkspaceMember,
  WorkspaceRole,
} from "../data/types";

function uid() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2, 11)
  );
}

function roleLabel(role: WorkspaceRole) {
  switch (role) {
    case "owner":
      return "Owner";
    case "co_owner":
      return "Co-owner";
    case "manager":
      return "Manager";
    default:
      return "Employee";
  }
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
    createCompanyWorkspace,
    createWorkgroupWorkspace,
    createWorkspaceInvite,
    revokeWorkspaceInvite,
    acceptWorkspaceInvite,
    updateWorkspaceMember,
    removeWorkspaceMember,
    leaveWorkspace,
    addJobRequest,
    approveJobRequest,
    declineJobRequest,
    deleteJobRequest,
  } = useApp();

  const isEmployee = role === "employee";
  const manager = !isEmployee;
  const admin = role === "owner" || role === "co_owner";
  const canInvite = manager;
  const { copiedMessage, copyText } = useCopyFeedback();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<
    Exclude<WorkspaceRole, "owner">
  >("employee");
  const [inviteCode, setInviteCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [companyOpen, setCompanyOpen] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [workgroupOpen, setWorkgroupOpen] = useState(false);
  const [workgroupName, setWorkgroupName] = useState("");
  const [memberOpen, setMemberOpen] = useState(false);
  const [selectedMember, setSelectedMember] =
    useState<WorkspaceMember | null>(null);
  const [memberRole, setMemberRole] = useState<
    Exclude<WorkspaceRole, "owner">
  >("employee");
  const [positionTitle, setPositionTitle] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestDraft, setRequestDraft] = useState({
    title: "",
    client: "",
    address: "",
    city: "",
    projectType: "Other job type",
    scopeDescription: "",
    proposedStart: "",
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const pendingInvites = workspaceInvites.filter(
    (invite) => invite.status === "pending"
  );
  const pendingRequests = useMemo(
    () => jobRequests.filter((request) => request.status === "pending"),
    [jobRequests]
  );

  const inputClass =
    "w-full min-h-11 px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/25";
  const labelClass =
    "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

  function inviteLink(token: string) {
    return `${window.location.origin}/login?mode=register&invite=${encodeURIComponent(token)}`;
  }

  async function createInvite() {
    setError("");
    setMessage("");
    if (!inviteEmail.trim()) {
      setError("Enter the email address you want to invite.");
      return;
    }
    setSaving(true);
    try {
      const cleanedCode = inviteCode.trim().toUpperCase();
      if (cleanedCode && !/^[A-Z0-9_-]{6,32}$/.test(cleanedCode)) {
        throw new Error(
          "Custom codes must be 6–32 characters using letters, numbers, dashes, or underscores."
        );
      }
      const invite = await createWorkspaceInvite(
        inviteEmail,
        inviteRole,
        cleanedCode
      );
      const copied = await copyText(invite.code, "Invite code copied");
      setMessage(
        copied
          ? `Invite created for ${invite.email}. The code ${invite.code} was copied. YardPilot does not send invitations automatically, so give the person the code or copy their invite link below.`
          : `Invite created for ${invite.email}. YardPilot does not send it automatically. Give them code ${invite.code}, or use Copy Link under Pending Invites.`
      );
      setInviteEmail("");
      setInviteCode("");
      setInviteOpen(false);
    } catch (inviteError) {
      setError(
        inviteError instanceof Error
          ? inviteError.message
          : "Could not create invite."
      );
    } finally {
      setSaving(false);
    }
  }

  async function joinWorkspace() {
    setError("");
    setMessage("");
    if (!joinCode.trim()) {
      setError("Paste an invite code or invite link first.");
      return;
    }
    setSaving(true);
    try {
      let code = joinCode.trim();
      try {
        const parsed = new URL(code);
        code = parsed.searchParams.get("invite") || code;
      } catch {
        // The value is a plain code.
      }
      await acceptWorkspaceInvite(code);
      setJoinCode("");
      setMessage("Workspace joined successfully.");
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : "Could not accept invite."
      );
    } finally {
      setSaving(false);
    }
  }

  async function createCompany() {
    setError("");
    if (!companyName.trim()) {
      setError("Enter a company name.");
      return;
    }
    setSaving(true);
    try {
      await createCompanyWorkspace(companyName);
      setCompanyOpen(false);
      setCompanyName("");
      setMessage("Company workspace created. You are its owner.");
    } catch (companyError) {
      setError(
        companyError instanceof Error
          ? companyError.message
          : "Could not create company."
      );
    } finally {
      setSaving(false);
    }
  }

  async function createWorkgroup() {
    setError("");
    if (!workgroupName.trim()) {
      setError("Enter a workgroup name.");
      return;
    }
    setSaving(true);
    try {
      await createWorkgroupWorkspace(workgroupName);
      setWorkgroupOpen(false);
      setWorkgroupName("");
      setMessage("Workgroup created. You are its owner.");
    } catch (workgroupError) {
      setError(
        workgroupError instanceof Error
          ? workgroupError.message
          : "Could not create workgroup."
      );
    } finally {
      setSaving(false);
    }
  }

  async function copyInvite(token: string) {
    const link = inviteLink(token);
    await copyText(link, "Invite link copied");
  }

  async function copyInviteCode(code: string) {
    await copyText(code, "Team code copied");
  }

  function emailInvite(email: string, token: string) {
    const link = inviteLink(token);
    const subject = encodeURIComponent(
      `Join ${activeWorkspace?.name ?? "my team"} on YardPilot`
    );
    const invite = workspaceInvites.find((item) => item.token === token);
    const body = encodeURIComponent(
      `You have been invited to join ${activeWorkspace?.name ?? "a YardPilot workspace"}.\n\nInvite code: ${invite?.code ?? ""}\nInvite link: ${link}\n\nYardPilot does not send invitations automatically; this email was opened by the inviter.`
    );
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
  }

  function editMember(member: WorkspaceMember) {
    if (member.role === "owner") return;
    setSelectedMember(member);
    setMemberRole(member.role as Exclude<WorkspaceRole, "owner">);
    setPositionTitle(member.positionTitle);
    setHourlyRate(member.hourlyRate ? String(member.hourlyRate) : "");
    setMemberOpen(true);
  }

  async function saveMember() {
    if (!selectedMember) return;
    setSaving(true);
    setError("");
    try {
      await updateWorkspaceMember(
        selectedMember.id,
        memberRole,
        positionTitle,
        Number(hourlyRate || 0)
      );
      setMemberOpen(false);
      setSelectedMember(null);
      setMessage(`${selectedMember.name}'s team profile was updated.`);
    } catch (memberError) {
      setError(
        memberError instanceof Error
          ? memberError.message
          : "Could not update the team member."
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(id: string, name: string) {
    if (!window.confirm(`Remove ${name} from this workspace?`)) return;
    try {
      await removeWorkspaceMember(id);
      setMessage(`${name} was removed from the workspace.`);
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Could not remove member."
      );
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
        city: requestDraft.city.trim(),
        projectType: requestDraft.projectType.trim() || "Other job type",
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
        city: "",
        projectType: "Other job type",
        scopeDescription: "",
        proposedStart: "",
      });
      setMessage("Estimate proposal sent for approval.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not create estimate proposal."
      );
    } finally {
      setSaving(false);
    }
  }

  async function approveRequest(request: JobRequest) {
    setError("");
    try {
      await approveJobRequest(request.id);
      setMessage(`${request.title} was approved and added as a draft estimate.`);
    } catch (approvalError) {
      setError(
        approvalError instanceof Error
          ? approvalError.message
          : "Could not approve estimate proposal."
      );
    }
  }

  async function declineRequest(request: JobRequest) {
    const notes = window.prompt("Optional note for the employee:", "") ?? "";
    try {
      await declineJobRequest(request.id, notes);
      setMessage(`${request.title} was declined.`);
    } catch (declineError) {
      setError(
        declineError instanceof Error
          ? declineError.message
          : "Could not decline job request."
      );
    }
  }

  async function removeRequest(request: JobRequest) {
    if (!window.confirm("Delete this estimate proposal?")) return;
    try {
      await deleteJobRequest(request.id);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete request."
      );
    }
  }

  async function leaveActiveWorkspace() {
    if (!activeWorkspace || activeWorkspace.isPersonal) return;
    const warning =
      role === "owner"
        ? `Leave ${activeWorkspace.name}? If you are the only member, the workspace and its data will be deleted. If other members remain, another co-owner must be available to become owner.`
        : `Leave ${activeWorkspace.name}? You will immediately lose access to its contacts, estimates, jobs, invoices, and schedule.`;
    if (!window.confirm(warning)) return;
    setSaving(true);
    setError("");
    try {
      await leaveWorkspace(activeWorkspace.id);
      setMessage(`You left ${activeWorkspace.name}.`);
    } catch (leaveError) {
      setError(
        leaveError instanceof Error
          ? leaveError.message
          : "Could not leave the workspace."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Team & Workspaces</h1>
          <p className="text-sm text-gray-500 mt-1">
            Personal workspaces stay private. Companies and workgroups use the
            same owner, co-owner, manager, and employee invitation roles.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCompanyOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 cursor-pointer"
          >
            <BriefcaseBusiness size={16} /> Create Company
          </button>
          <button
            type="button"
            onClick={() => setWorkgroupOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 cursor-pointer"
          >
            <Users size={16} /> Create Workgroup
          </button>
          {isEmployee && (
            <button
              type="button"
              onClick={() => setRequestOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 cursor-pointer"
            >
              <Clipboard size={16} /> Propose Estimate
            </button>
          )}
          {canInvite && activeWorkspace?.kind !== "personal" && (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-semibold cursor-pointer"
            >
              <UserPlus size={16} /> Invite Team Member
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
        <div className="mb-5 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {message}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 mb-6">
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Users size={17} className="text-green-700" />
            <h2 className="font-bold text-gray-900">Workspace Members</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {workspaceMembers.map((member) => (
              <div
                key={member.id}
                className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold shrink-0">
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900 truncate">
                      {member.name}
                    </p>
                    {member.userId === authUserId && (
                      <span className="text-xs text-gray-400">You</span>
                    )}
                    {member.role === "owner" && (
                      <ShieldCheck size={14} className="text-green-700" />
                    )}
                  </div>
                  <p className="text-sm text-gray-500 truncate">
                    {member.email}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {member.positionTitle || roleLabel(member.role)}
                    {manager && member.hourlyRate > 0
                      ? ` · $${member.hourlyRate.toFixed(2)}/hr`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold capitalize rounded-full bg-gray-100 text-gray-600 px-2.5 py-1">
                    {roleLabel(member.role)}
                  </span>
                  {(admin || (role === "manager" && member.role === "employee")) &&
                    member.role !== "owner" && (
                    <button
                      type="button"
                      onClick={() => editMember(member)}
                      className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 cursor-pointer"
                      aria-label={`Edit ${member.name}`}
                    >
                      <Edit3 size={15} />
                    </button>
                  )}
                  {admin && member.role !== "owner" && member.userId !== authUserId && (
                    <button
                      type="button"
                      onClick={() => void removeMember(member.id, member.name)}
                      className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:text-red-600 cursor-pointer"
                      aria-label={`Remove ${member.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900">Active Workspace</h2>
            <p className="text-sm text-gray-500 mt-1">
              Switch between your private workspace and companies you belong to.
            </p>
            <select
              value={activeWorkspaceId ?? ""}
              onChange={(event) => void switchWorkspace(event.target.value)}
              className={`${inputClass} mt-4`}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name} — {roleLabel(workspace.role)}
                </option>
              ))}
            </select>
            {activeWorkspace && (
              <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                {activeWorkspace.isPersonal
                  ? "Private personal workspace"
                  : `${activeWorkspace.kind === "workgroup" ? "Workgroup" : "Company workspace"} · ${roleLabel(activeWorkspace.role)}`}
              </div>
            )}
            {activeWorkspace && !activeWorkspace.isPersonal && (
              <button
                type="button"
                onClick={() => void leaveActiveWorkspace()}
                disabled={saving}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                <LogOut size={15} /> Leave Workspace
              </button>
            )}
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900">Join a Company</h2>
            <p className="text-sm text-gray-500 mt-1">
              Paste the invite code or full invite link supplied by the person inviting you.
            </p>
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              placeholder="Invite code or link"
              className={`${inputClass} mt-4`}
            />
            <button
              type="button"
              onClick={() => void joinWorkspace()}
              disabled={saving}
              className="w-full mt-3 px-4 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
            >
              Join Workspace
            </button>
          </section>

          {manager && pendingInvites.length > 0 && (
            <section className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-bold text-gray-900">Pending Invites</h2>
              <div className="space-y-3 mt-4">
                {pendingInvites.map((invite) => (
                  <div key={invite.id} className="rounded-lg border border-gray-200 p-3">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {invite.email}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {roleLabel(invite.role)} · code <span className="font-mono font-semibold text-gray-600">{invite.code}</span> · expires {new Date(invite.expiresAt).toLocaleDateString("en-US")}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => void copyInviteCode(invite.code)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 cursor-pointer"
                      >
                        <Copy size={13} /> Copy Code
                      </button>
                      <button
                        type="button"
                        onClick={() => void copyInvite(invite.token)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700 cursor-pointer"
                      >
                        <Copy size={13} /> Copy Link
                      </button>
                      <button
                        type="button"
                        onClick={() => emailInvite(invite.email, invite.token)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 cursor-pointer"
                      >
                        <Mail size={13} /> Email
                      </button>
                      <button
                        type="button"
                        onClick={() => void revokeWorkspaceInvite(invite.id)}
                        className="ml-auto text-xs font-semibold text-red-600 cursor-pointer"
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>

      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-900">Estimate Proposals</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Employees can propose an estimate. Owners, co-owners, or managers approve it before it enters the normal estimate lifecycle.
            </p>
          </div>
          <span className="text-sm text-gray-400">
            {pendingRequests.length} pending
          </span>
        </div>

        {jobRequestsLoading ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            Loading proposals...
          </div>
        ) : jobRequests.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">
            No estimate proposals yet.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {jobRequests.map((request) => (
              <div
                key={request.id}
                className="px-5 py-5 flex flex-col lg:flex-row lg:items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900">
                      {request.title}
                    </p>
                    <span
                      className={`text-xs font-semibold capitalize px-2 py-1 rounded-full ${
                        request.status === "approved"
                          ? "bg-green-100 text-green-700"
                          : request.status === "declined"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {request.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Proposed by {request.requestedByName}
                    {request.client ? ` · ${request.client}` : ""}
                  </p>
                  {request.address && (
                    <p className="text-sm text-gray-400 mt-1">
                      {request.address}
                    </p>
                  )}
                  {request.scopeDescription && (
                    <p className="text-sm text-gray-600 mt-2">
                      {request.scopeDescription}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {manager && request.status === "pending" && (
                    <>
                      <button
                        type="button"
                        onClick={() => void approveRequest(request)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold cursor-pointer"
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
                  {(request.requestedBy === authUserId || manager) &&
                    request.status === "pending" && (
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

      {companyOpen && (
        <div className="app-modal-overlay fixed inset-0 z-[90] flex min-h-0 items-stretch sm:items-center justify-center bg-black/55 p-0 sm:p-4">
          <div className="w-full h-[100dvh] sm:h-auto sm:max-w-lg sm:max-h-[92vh] bg-white sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Create Company Workspace</h2>
              <button type="button" onClick={() => setCompanyOpen(false)} className="text-gray-400 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 sm:p-6">
              <label className={labelClass}>Company Name</label>
              <input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="John's Lawn Care"
                className={inputClass}
              />
              <p className="text-sm text-gray-500 mt-3">
                Company names are unique. You will be the owner and can invite
                co-owners, managers, and employees afterward.
              </p>
            </div>
            <div className="px-5 sm:px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button type="button" onClick={() => setCompanyOpen(false)} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={() => void createCompany()} disabled={saving} className="px-4 py-2.5 bg-slate-800 text-white rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60">
                Create Company
              </button>
            </div>
          </div>
        </div>
      )}

      {workgroupOpen && (
        <div className="app-modal-overlay fixed inset-0 z-[90] flex min-h-0 items-stretch sm:items-center justify-center bg-black/55 p-0 sm:p-4">
          <div className="w-full h-[100dvh] sm:h-auto sm:max-w-lg sm:max-h-[92vh] bg-white sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Create Workgroup</h2>
              <button type="button" onClick={() => setWorkgroupOpen(false)} className="text-gray-400 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 sm:p-6">
              <label className={labelClass}>Workgroup Name</label>
              <input
                value={workgroupName}
                onChange={(event) => setWorkgroupName(event.target.value)}
                placeholder="North Crew, Weekend Team, John's Workgroup…"
                className={inputClass}
              />
              <p className="text-sm text-gray-500 mt-3">
                Workgroups collaborate exactly like company workspaces, but their names do not need to be unique. You can invite co-owners, managers, and employees.
              </p>
            </div>
            <div className="px-5 sm:px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button type="button" onClick={() => setWorkgroupOpen(false)} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={() => void createWorkgroup()} disabled={saving} className="px-4 py-2.5 bg-slate-800 text-white rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60">
                Create Workgroup
              </button>
            </div>
          </div>
        </div>
      )}

      {inviteOpen && (
        <div className="app-modal-overlay fixed inset-0 z-[90] flex min-h-0 items-stretch sm:items-center justify-center bg-black/55 p-0 sm:p-4">
          <div className="w-full h-[100dvh] sm:h-auto sm:max-w-lg sm:max-h-[92vh] bg-white sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900">Invite Team Member</h2>
              <button type="button" onClick={() => setInviteOpen(false)} className="text-gray-400 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 sm:p-6 min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-4">
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
                <label className={labelClass}>
                  Custom Team Code <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  value={inviteCode}
                  onChange={(event) =>
                    setInviteCode(
                      event.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9_-]/g, "")
                        .slice(0, 32)
                    )
                  }
                  placeholder="JOHNSLAWN24"
                  className={inputClass}
                />
                <p className="mt-1.5 text-xs text-gray-400">
                  Leave blank to generate a secure code. The code is tied to the invited email and expires.
                </p>
              </div>
              <div>
                <label className={labelClass}>Access Level</label>
                <select
                  value={inviteRole}
                  onChange={(event) =>
                    setInviteRole(
                      event.target.value as Exclude<WorkspaceRole, "owner">
                    )
                  }
                  className={inputClass}
                >
                  <option value="employee">Employee — assigned work only</option>
                  {admin && (
                    <option value="manager">Manager — operations and employees</option>
                  )}
                  {admin && (
                    <option value="co_owner">Co-owner — full company access</option>
                  )}
                </select>
              </div>
              <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-500">
                YardPilot does not send invitations automatically. After creating it, give the person the code or use Copy Link under Pending Invites.
              </div>
            </div>
            <div className="px-5 sm:px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button type="button" onClick={() => setInviteOpen(false)} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={() => void createInvite()} disabled={saving} className="px-4 py-2.5 bg-slate-800 text-white rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60">
                Create Invite
              </button>
            </div>
          </div>
        </div>
      )}

      {memberOpen && selectedMember && (
        <div className="app-modal-overlay fixed inset-0 z-[90] flex min-h-0 items-stretch sm:items-center justify-center bg-black/55 p-0 sm:p-4">
          <div className="w-full h-[100dvh] sm:h-auto sm:max-w-lg sm:max-h-[92vh] bg-white sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900">Edit Team Member</h2>
                <p className="text-sm text-gray-500 mt-0.5">{selectedMember.name}</p>
              </div>
              <button type="button" onClick={() => setMemberOpen(false)} className="text-gray-400 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 sm:p-6 min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-4">
              <div>
                <label className={labelClass}>Role</label>
                <select
                  value={memberRole}
                  onChange={(event) =>
                    setMemberRole(
                      event.target.value as Exclude<WorkspaceRole, "owner">
                    )
                  }
                  className={inputClass}
                >
                  <option value="employee">Employee</option>
                  {admin && <option value="manager">Manager</option>}
                  {admin && <option value="co_owner">Co-owner</option>}
                </select>
              </div>
              <div>
                <label className={labelClass}>Position / Title</label>
                <input
                  value={positionTitle}
                  onChange={(event) => setPositionTitle(event.target.value)}
                  placeholder="Crew Lead, Irrigation Technician..."
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Labor Rate Per Hour</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={hourlyRate}
                    onChange={(event) =>
                      setHourlyRate(event.target.value.replace(/[^0-9.]/g, ""))
                    }
                    placeholder="0.00"
                    className={`${inputClass} pl-7`}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1.5">
                  Used automatically when this person is assigned hours on an estimate. Employees cannot see other workers' rates.
                </p>
              </div>
            </div>
            <div className="px-5 sm:px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button type="button" onClick={() => setMemberOpen(false)} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 cursor-pointer">
                Cancel
              </button>
              <button type="button" onClick={() => void saveMember()} disabled={saving} className="px-4 py-2.5 bg-slate-800 text-white rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60">
                Save Team Profile
              </button>
            </div>
          </div>
        </div>
      )}

      <CopyToast message={copiedMessage} />

      {requestOpen && isEmployee && (
        <div className="app-modal-overlay fixed inset-0 z-[90] flex min-h-0 items-stretch sm:items-center justify-center bg-black/55 p-0 sm:p-4">
          <div className="w-full h-[100dvh] sm:h-auto sm:max-w-2xl sm:max-h-[92vh] bg-white sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="font-bold text-gray-900">Propose an Estimate</h2>
              <button type="button" onClick={() => setRequestOpen(false)} className="text-gray-400 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 sm:p-6 grid min-h-0 flex-1 sm:grid-cols-2 gap-4 overflow-y-auto overscroll-contain">
              <div className="sm:col-span-2">
                <label className={labelClass}>Estimate / Project Title</label>
                <input value={requestDraft.title} onChange={(event) => setRequestDraft((current) => ({ ...current, title: event.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Customer</label>
                <input value={requestDraft.client} onChange={(event) => setRequestDraft((current) => ({ ...current, client: event.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Proposed Start</label>
                <input type="datetime-local" value={requestDraft.proposedStart} onChange={(event) => setRequestDraft((current) => ({ ...current, proposedStart: event.target.value }))} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Address</label>
                <input value={requestDraft.address} onChange={(event) => setRequestDraft((current) => ({ ...current, address: event.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>City</label>
                <input value={requestDraft.city} onChange={(event) => setRequestDraft((current) => ({ ...current, city: event.target.value }))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Job Type</label>
                <input value={requestDraft.projectType} onChange={(event) => setRequestDraft((current) => ({ ...current, projectType: event.target.value }))} placeholder="Lawn maintenance, cleanup, other…" className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Scope / Description</label>
                <textarea rows={4} value={requestDraft.scopeDescription} onChange={(event) => setRequestDraft((current) => ({ ...current, scopeDescription: event.target.value }))} className={inputClass} />
              </div>
            </div>
            <div className="px-5 sm:px-6 py-4 border-t border-gray-100 flex justify-end gap-2 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button type="button" onClick={() => setRequestOpen(false)} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 cursor-pointer">Cancel</button>
              <button type="button" onClick={() => void createJobRequest()} disabled={saving} className="px-4 py-2.5 bg-slate-800 text-white rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-60">Send Estimate Proposal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

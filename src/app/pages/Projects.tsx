import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  PlusCircle,
  ReceiptText,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import ConfirmDialog from "../components/ConfirmDialog";
import { useApp } from "../context/AppContext";
import type { ProjectStatus } from "../data/types";
import { combinedLaborHours, formatMoney } from "../lib/estimate";

type TimeFilter = "recent" | "1m" | "6m" | "12m" | "all";

type ConfirmState =
  | { type: "complete"; projectId: string; title: string }
  | { type: "bulk-delete"; projectId: ""; title: string }
  | null;

function withinTimeFilter(dateValue: string, filter: TimeFilter) {
  if (filter === "all") return true;
  const date = new Date(dateValue).getTime();
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const days = filter === "recent" ? 14 : filter === "1m" ? 31 : filter === "6m" ? 183 : 365;
  return date >= now - days * day;
}

export default function Projects({ status }: { status: ProjectStatus }) {
  const {
    authUserId,
    role,
    projects,
    invoices,
    projectsLoading,
    projectsError,
    assignSelfToProject,
    completeProject,
    bulkDeleteProjects,
  } = useApp();
  const navigate = useNavigate();
  const [claimingId, setClaimingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("recent");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const isEmployee = role === "employee";
  const isPast = status !== "active";

  const filtered = useMemo(
    () =>
      projects
        .filter((project) => {
          const statusMatches = isPast
            ? project.status === "completed" || project.status === "archived"
            : project.status === "active" && project.estimateStatus === "accepted";
          if (!statusMatches) return false;
          return !isPast || withinTimeFilter(project.updatedAt, timeFilter);
        })
        .sort(
          (first, second) =>
            new Date(second.updatedAt).getTime() -
            new Date(first.updatedAt).getTime()
        ),
    [projects, isPast, timeFilter]
  );

  const title = isPast ? "Past Jobs" : isEmployee ? "Jobs" : "Current Jobs";
  const allVisibleSelected =
    filtered.length > 0 && filtered.every((project) => selectedIds.includes(project.id));

  async function claim(projectId: string) {
    setActionError("");
    setClaimingId(projectId);
    try {
      await assignSelfToProject(projectId);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "The job could not be claimed."
      );
    } finally {
      setClaimingId("");
    }
  }

  async function runConfirmedAction() {
    if (!confirmState) return;
    setBusy(true);
    setActionError("");
    try {
      if (confirmState.type === "bulk-delete") {
        await bulkDeleteProjects(selectedIds);
        setSelectedIds([]);
        setConfirmState(null);
        return;
      }
      const invoiceId = await completeProject(confirmState.projectId);
      setConfirmState(null);
      navigate(`/app/invoices/${invoiceId}`);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "The job action failed."
      );
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(projectId: string) {
    setSelectedIds((current) =>
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId]
    );
  }

  function toggleAllVisible() {
    if (allVisibleSelected) {
      const visible = new Set(filtered.map((project) => project.id));
      setSelectedIds((current) => current.filter((id) => !visible.has(id)));
      return;
    }
    setSelectedIds((current) => [
      ...new Set([...current, ...filtered.map((project) => project.id)]),
    ]);
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {filtered.length} {filtered.length === 1 ? "job" : "jobs"}
            {isEmployee && !isPast ? " available or assigned to you" : ""}
          </p>
        </div>
        {!isPast && !isEmployee && (
          <Link
            to="/app/estimate/new"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900"
          >
            <PlusCircle size={16} /> New Estimate
          </Link>
        )}
      </div>

      {isPast && (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={timeFilter}
              onChange={(event) => setTimeFilter(event.target.value as TimeFilter)}
              className="min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700"
            >
              <option value="recent">Recent · 14 days</option>
              <option value="1m">Last month</option>
              <option value="6m">Last 6 months</option>
              <option value="12m">Last 12 months</option>
              <option value="all">All time</option>
            </select>
            {!isEmployee && filtered.length > 0 && (
              <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Select visible
              </label>
            )}
          </div>
          {!isEmployee && selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setConfirmState({
                  type: "bulk-delete",
                  projectId: "",
                  title: `${selectedIds.length} selected Past Jobs`,
                })
              }
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              <Trash2 size={15} /> Delete selected ({selectedIds.length})
            </button>
          )}
        </div>
      )}

      {(projectsError || actionError) && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError || projectsError}
        </div>
      )}

      {projectsLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-16 text-center text-sm text-gray-400">
          Loading jobs…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-16 text-center text-sm text-gray-400">
          {isPast
            ? "No completed jobs match this time period."
            : "No accepted estimates have become jobs yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((project) => {
            const assignedToMe = project.assignedMemberIds.includes(
              authUserId ?? ""
            );
            const unassigned = project.assignedMemberIds.length === 0;
            const jobHref = isEmployee
              ? `/app/jobs/${project.id}`
              : `/app/estimates/${project.id}`;
            const invoice = invoices.find((item) => item.projectId === project.id);
            const totalHours = combinedLaborHours(project);
            const assignedNames = project.laborAssignments
              .map((assignment) => assignment.name)
              .filter(Boolean);

            return (
              <article
                key={project.id}
                className="rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-start gap-4">
                  {isPast && !isEmployee && (
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(project.id)}
                      onChange={() => toggleSelected(project.id)}
                      aria-label={`Select ${project.name}`}
                      className="mt-1 h-4 w-4 rounded border-gray-300"
                    />
                  )}

                  <Link to={jobHref} className="min-w-[220px] flex-1 group">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <p className="font-bold text-gray-900 group-hover:text-slate-700">
                        {project.name}
                      </p>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {project.projectType || "Other job type"}
                      </span>
                      {isPast && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          Completed
                        </span>
                      )}
                      {isEmployee && !isPast && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            assignedToMe
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {assignedToMe ? "Assigned to me" : "Open job"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {project.client || "No client"} ·{" "}
                      {project.address || "No address"}
                      {project.city ? `, ${project.city}` : ""}
                    </p>

                    {isEmployee && project.scopeDescription && (
                      <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                        {project.scopeDescription}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 size={13} />
                        {totalHours.toLocaleString("en-US")} estimated combined hours
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Users size={13} />
                        {assignedNames.length
                          ? assignedNames.join(", ")
                          : "No employees assigned"}
                      </span>
                      {project.scheduledStart && !isPast && (
                        <span className="inline-flex items-center gap-1.5">
                          <CalendarDays size={13} />
                          {new Date(project.scheduledStart).toLocaleString("en-US", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      )}
                    </div>
                  </Link>

                  {!isEmployee && (
                    <div className="shrink-0 text-right">
                      <p className="font-bold text-gray-900">
                        {formatMoney(project.totalEstimate)}
                      </p>
                      <p className="mt-1 text-xs capitalize text-gray-400">
                        {isPast ? "completed job" : "accepted estimate"}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {isEmployee && !isPast && unassigned && (
                      <button
                        type="button"
                        onClick={() => void claim(project.id)}
                        disabled={Boolean(claimingId)}
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60 cursor-pointer"
                      >
                        <UserPlus size={15} />
                        {claimingId === project.id ? "Claiming…" : "Assign to me"}
                      </button>
                    )}

                    {!isEmployee && !isPast && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmState({
                            type: "complete",
                            projectId: project.id,
                            title: project.name,
                          })
                        }
                        disabled={busy}
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60 cursor-pointer"
                      >
                        <CheckCircle2 size={15} /> Complete Job
                      </button>
                    )}

                    {!isEmployee && isPast && (
                      <Link
                        to={`/app/estimates/${project.id}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <FileText size={15} /> Archived Estimate
                      </Link>
                    )}

                    {!isEmployee && isPast && invoice && (
                      <Link
                        to={`/app/invoices/${invoice.id}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <ReceiptText size={15} />
                        {invoice.archivedAt
                          ? `Archived Invoice · ${invoice.status}`
                          : "Open Invoice"}
                      </Link>
                    )}

                    <Link to={jobHref} aria-label={`Open ${project.name}`}>
                      <ChevronRight size={18} className="text-gray-400" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={
          confirmState?.type === "bulk-delete"
            ? `Permanently delete ${selectedIds.length} Past Jobs?`
            : `Complete “${confirmState?.title ?? "this job"}”?`
        }
        description={
          confirmState?.type === "bulk-delete"
            ? "This permanently deletes the selected Past Jobs and their connected archived estimates, invoices, assignments, calendar records, and follow-ups. This cannot be undone."
            : "A final draft invoice will be created from the accepted estimate. The job will leave Current Jobs and Schedule and move to Past Jobs."
        }
        confirmLabel={
          confirmState?.type === "bulk-delete"
            ? "Delete Past Jobs"
            : "Complete Job"
        }
        destructive={confirmState?.type === "bulk-delete"}
        busy={busy}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => void runConfirmedAction()}
      />
    </div>
  );
}

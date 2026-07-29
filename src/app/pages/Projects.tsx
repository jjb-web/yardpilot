import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  PlusCircle,
  ReceiptText,
  UserPlus,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type { ProjectStatus } from "../data/types";
import { formatMoney } from "../lib/estimate";

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
    updateProject,
  } = useApp();
  const navigate = useNavigate();
  const [claimingId, setClaimingId] = useState("");
  const [completingId, setCompletingId] = useState("");
  const [archivingId, setArchivingId] = useState("");
  const [actionError, setActionError] = useState("");

  const isEmployee = role === "employee";
  const isPast = status !== "active";
  const filtered = projects.filter((project) =>
    isPast
      ? project.status === "completed" || project.status === "archived"
      : project.status === "active"
  );
  const title = isPast ? "Past Jobs" : isEmployee ? "Jobs" : "Current Jobs";

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

  async function finishJob(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    const confirmed = window.confirm(
      `Complete ${project.name}? It will move to Past Jobs, leave the calendar, and create a final invoice from the agreed estimate.`
    );
    if (!confirmed) return;

    setActionError("");
    setCompletingId(projectId);
    try {
      const invoiceId = await completeProject(projectId);
      navigate(`/app/invoices/${invoiceId}`);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "The job could not be completed."
      );
    } finally {
      setCompletingId("");
    }
  }

  async function archiveJob(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    setActionError("");
    setArchivingId(projectId);
    try {
      await updateProject({
        ...project,
        status: "archived",
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "The job could not be archived."
      );
    } finally {
      setArchivingId("");
    }
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
          No {isPast ? "past" : "active"} jobs yet.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((project) => {
            const assignedToMe = project.assignedMemberIds.includes(
              authUserId ?? ""
            );
            const unassigned = project.assignedMemberIds.length === 0;
            const href = isEmployee
              ? `/app/jobs/${project.id}`
              : `/app/estimates/${project.id}`;
            const invoice = invoices.find(
              (item) => item.projectId === project.id && item.status !== "void"
            );

            return (
              <div
                key={project.id}
                className="rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-center gap-4">
                  <Link to={href} className="min-w-[220px] flex-1 group">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <p className="font-bold text-gray-900 group-hover:text-slate-700">
                        {project.name}
                      </p>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {project.projectType || "Other job type"}
                      </span>
                      {project.status === "archived" && (
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600">
                          Archived
                        </span>
                      )}
                      {isEmployee && (
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
                      {project.client || "No client"} · {project.address || "No address"}
                      {project.city ? `, ${project.city}` : ""}
                    </p>
                    {project.scheduledStart && !isPast && (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-500">
                        <CalendarDays size={13} />
                        {new Date(project.scheduledStart).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    )}
                  </Link>

                  {!isEmployee && (
                    <div className="text-right shrink-0">
                      <p className="font-bold text-gray-900">
                        {formatMoney(project.totalEstimate)}
                      </p>
                      <p className="mt-1 text-xs capitalize text-gray-400">
                        {project.estimateStatus}
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
                        onClick={() => void finishJob(project.id)}
                        disabled={Boolean(completingId)}
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60 cursor-pointer"
                      >
                        <CheckCircle2 size={15} />
                        {completingId === project.id
                          ? "Completing…"
                          : "Complete Job"}
                      </button>
                    )}

                    {!isEmployee && isPast && invoice && (
                      <Link
                        to={`/app/invoices/${invoice.id}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                      >
                        <ReceiptText size={15} /> Invoice
                      </Link>
                    )}

                    {!isEmployee && isPast && project.status !== "archived" && (
                      <button
                        type="button"
                        onClick={() => void archiveJob(project.id)}
                        disabled={Boolean(archivingId)}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60 cursor-pointer"
                      >
                        <Archive size={15} />
                        {archivingId === project.id ? "Archiving…" : "Archive"}
                      </button>
                    )}

                    <Link to={href} aria-label={`Open ${project.name}`}>
                      <ChevronRight size={18} className="text-gray-400" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

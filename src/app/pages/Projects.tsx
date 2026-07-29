import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  PlusCircle,
  ReceiptText,
  UserPlus,
  Users,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type { ProjectStatus } from "../data/types";
import { combinedLaborHours, formatMoney } from "../lib/estimate";

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
  } = useApp();
  const navigate = useNavigate();
  const [claimingId, setClaimingId] = useState("");
  const [completingId, setCompletingId] = useState("");
  const [actionError, setActionError] = useState("");

  const isEmployee = role === "employee";
  const isPast = status !== "active";
  const filtered = projects
    .filter((project) =>
      isPast
        ? project.status === "completed" || project.status === "archived"
        : project.status === "active" && project.estimateStatus === "accepted"
    )
    .sort(
      (first, second) =>
        new Date(second.updatedAt).getTime() -
        new Date(first.updatedAt).getTime()
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
      `Mark “${project.name}” complete? A final invoice will be created and the job will move to Past Jobs.`
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
          {isPast
            ? "No completed jobs yet."
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
                      {project.client || "No client"} · {project.address || "No address"}
                      {project.city ? `, ${project.city}` : ""}
                    </p>

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
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router";
import {
  CalendarDays,
  ChevronRight,
  PlusCircle,
  UserPlus,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type { ProjectStatus } from "../data/types";

export default function Projects({ status }: { status: ProjectStatus }) {
  const {
    authUserId,
    role,
    projects,
    projectsLoading,
    projectsError,
    assignSelfToProject,
  } = useApp();
  const [claimingId, setClaimingId] = useState("");
  const [claimError, setClaimError] = useState("");

  const isEmployee = role === "employee";
  const filtered = projects.filter((project) => project.status === status);
  const title =
    status === "active"
      ? isEmployee
        ? "Jobs"
        : "Current Jobs"
      : "Past Projects";

  async function claim(projectId: string) {
    setClaimError("");
    setClaimingId(projectId);
    try {
      await assignSelfToProject(projectId);
    } catch (error) {
      setClaimError(
        error instanceof Error ? error.message : "The job could not be claimed."
      );
    } finally {
      setClaimingId("");
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length} {filtered.length === 1 ? "job" : "jobs"}
            {isEmployee ? " available or assigned to you" : ""}
          </p>
        </div>
        {status === "active" && !isEmployee && (
          <Link
            to="/app/estimate/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800"
          >
            <PlusCircle size={16} /> New Estimate
          </Link>
        )}
      </div>

      {(projectsError || claimError) && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {claimError || projectsError}
        </div>
      )}

      {projectsLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-16 text-center text-sm text-gray-400">
          Loading jobs…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-16 text-center text-sm text-gray-400">
          No {status === "active" ? "active" : "completed"} jobs yet.
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

            return (
              <div
                key={project.id}
                className="rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-center gap-4">
                  <Link to={href} className="flex-1 min-w-[220px] group">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <p className="font-bold text-gray-900 group-hover:text-green-700">
                        {project.name}
                      </p>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {project.projectType}
                      </span>
                      {isEmployee && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            assignedToMe
                              ? "bg-green-100 text-green-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {assignedToMe ? "Assigned to me" : "Open job"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {project.client || "No client"} · {project.address || "No address"}
                    </p>
                    {project.scheduledStart && (
                      <p className="inline-flex items-center gap-1.5 text-xs text-gray-500 mt-2">
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
                        {project.totalEstimate.toLocaleString("en-US", {
                          style: "currency",
                          currency: "USD",
                        })}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {project.estimateStatus}
                      </p>
                    </div>
                  )}

                  {isEmployee && unassigned && (
                    <button
                      type="button"
                      onClick={() => void claim(project.id)}
                      disabled={Boolean(claimingId)}
                      className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-60"
                    >
                      <UserPlus size={15} />
                      {claimingId === project.id ? "Claiming…" : "Assign to me"}
                    </button>
                  )}

                  <Link to={href} aria-label={`Open ${project.name}`}>
                    <ChevronRight size={18} className="text-gray-400" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

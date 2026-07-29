import { Link, useParams } from "react-router";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  MapPin,
  UserRound,
  Clock3,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { combinedLaborHours } from "../lib/estimate";

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const {
    authUserId,
    role,
    projects,
    projectsLoading,
    workspaceMembers,
    assignSelfToProject,
  } = useApp();

  const project = projects.find((item) => item.id === id) ?? null;

  if (projectsLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading job...</div>;
  }

  if (!project) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <h1 className="text-xl font-bold text-gray-900">Job not found</h1>
          <Link to="/app/projects/current" className="inline-block mt-4 text-sm font-semibold text-green-700">
            Return to current jobs
          </Link>
        </div>
      </div>
    );
  }

  const assigned = project.assignedMemberIds
    .map((userId) => workspaceMembers.find((member) => member.userId === userId))
    .filter(Boolean);
  const isAssigned = Boolean(authUserId && project.assignedMemberIds.includes(authUserId));
  const totalHours = combinedLaborHours(project);
  const canClaim = role === "employee" && project.assignedMemberIds.length === 0;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link
        to="/app/projects/current"
        className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 mb-5"
      >
        <ArrowLeft size={15} /> Current Jobs
      </Link>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="bg-green-950 text-white p-7">
          <div className="flex flex-col md:flex-row md:items-start gap-5">
            <div className="flex-1">
              <p className="text-green-300 text-xs font-bold uppercase tracking-wider">
                {project.projectType}
              </p>
              <h1 className="text-3xl font-bold mt-2">{project.name}</h1>
              <p className="text-green-100 mt-2">{project.client || "No customer listed"}</p>
            </div>
            {isAssigned && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/20 px-3 py-1.5 text-sm font-semibold text-green-200">
                <CheckCircle2 size={15} /> Assigned to you
              </span>
            )}
            {canClaim && (
              <button
                type="button"
                onClick={() => void assignSelfToProject(project.id)}
                className="rounded-lg bg-green-500 px-4 py-2.5 text-sm font-bold text-green-950 cursor-pointer"
              >
                Claim This Job
              </button>
            )}
          </div>
        </div>

        <div className="p-7 grid lg:grid-cols-[1fr_280px] gap-7">
          <div className="space-y-6">
            <section>
              <h2 className="font-bold text-gray-900 mb-3">Scope of Work</h2>
              <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">
                {project.scopeDescription || project.aiEstimate || "No scope description has been added yet."}
              </p>
            </section>

            {project.clientNotes && (
              <section>
                <h2 className="font-bold text-gray-900 mb-3">Job Notes</h2>
                <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {project.clientNotes}
                </p>
              </section>
            )}

            {project.lineItems.length > 0 && (
              <section>
                <h2 className="font-bold text-gray-900 mb-3">Materials and Tasks</h2>
                <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                  {project.lineItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <p className="text-sm font-semibold text-gray-800">
                        {item.description || "Unlabeled item"}
                      </p>
                      <p className="text-sm text-gray-500 shrink-0">
                        {item.qty} {item.unit}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <MapPin size={16} />
                <span className="text-xs font-bold uppercase tracking-wide">Location</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {[project.address, project.city].filter(Boolean).join(", ") || "No address listed"}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <Clock3 size={16} />
                <span className="text-xs font-bold uppercase tracking-wide">Estimated Time</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {totalHours.toLocaleString("en-US")} combined crew hours
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 text-gray-500 mb-2">
                <CalendarDays size={16} />
                <span className="text-xs font-bold uppercase tracking-wide">Schedule</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {project.scheduledStart
                  ? new Date(project.scheduledStart).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "Not scheduled"}
              </p>
              {project.scheduledEnd && (
                <p className="text-xs text-gray-400 mt-1">
                  Ends {new Date(project.scheduledEnd).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 text-gray-500 mb-3">
                <UserRound size={16} />
                <span className="text-xs font-bold uppercase tracking-wide">Assigned Crew</span>
              </div>
              {assigned.length === 0 ? (
                <p className="text-sm text-gray-400">Unassigned</p>
              ) : (
                <div className="space-y-2">
                  {assigned.map((member) => (
                    <p key={member!.userId} className="text-sm font-semibold text-gray-900">
                      {member!.name}
                    </p>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl bg-gray-50 p-5 text-xs text-gray-500">
              Employee view hides labor rates, line-item prices, estimate totals, discounts, taxes, and internal notes.
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

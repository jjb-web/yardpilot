import { Link } from "react-router";
import {
  ChevronRight,
  PlusCircle,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type { ProjectStatus } from "../data/types";

export default function Projects({
  status,
}: {
  status: ProjectStatus;
}) {
  const {
    projects,
    projectsLoading,
    projectsError,
  } = useApp();

  const filtered = projects.filter(
    (project) => project.status === status
  );
  const title =
    status === "active"
      ? "Current Jobs"
      : "Past Projects";
  const empty =
    status === "active"
      ? "No active jobs yet. Create your first estimate to get started."
      : "No completed projects yet.";

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1
            className="text-2xl font-bold text-gray-900"
            style={{
              fontFamily:
                "'Plus Jakarta Sans', sans-serif",
            }}
          >
            {title}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            {filtered.length}{" "}
            {filtered.length === 1
              ? "project"
              : "projects"}
          </p>
        </div>

        {status === "active" && (
          <Link
            to="/app/estimate/new"
            className="flex items-center gap-1.5 px-4 py-2.5 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 transition-colors"
          >
            <PlusCircle size={15} />
            New Estimate
          </Link>
        )}
      </div>

      {projectsError && (
        <div className="mb-5 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          Could not load projects:{" "}
          {projectsError}
        </div>
      )}

      {projectsLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <p className="text-gray-400 text-sm">
            Loading projects...
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <p className="text-gray-400 text-sm">
            {empty}
          </p>
          {status === "active" && (
            <Link
              to="/app/estimate/new"
              className="inline-block mt-4 text-sm text-green-700 font-semibold hover:underline"
            >
              + Create first estimate
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
          {filtered.map((project) => (
            <Link
              key={project.id}
              to={`/app/estimate/${project.id}`}
              className="flex items-center gap-5 px-6 py-5 hover:bg-gray-50 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-gray-900 text-sm">
                    {project.name}
                  </p>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
                    {project.projectType}
                  </span>
                </div>

                <p className="text-xs text-gray-500">
                  {project.client ||
                    "No client"}{" "}
                  ·{" "}
                  {project.address ||
                    "No address"}
                </p>

                {project.aiEstimate && (
                  <p className="text-xs text-green-700 mt-1.5 truncate max-w-lg">
                    ✦{" "}
                    {project.aiEstimate.slice(
                      0,
                      90
                    )}
                    {project.aiEstimate.length >
                    90
                      ? "..."
                      : ""}
                  </p>
                )}
              </div>

              <div className="text-right shrink-0">
                <p className="font-bold text-gray-900">
                  $
                  {project.totalEstimate.toLocaleString(
                    "en-US"
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(
                    project.updatedAt
                  ).toLocaleDateString(
                    "en-US",
                    {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }
                  )}
                </p>
              </div>

              <ChevronRight
                size={16}
                className="text-gray-300 group-hover:text-gray-500 transition-colors shrink-0"
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
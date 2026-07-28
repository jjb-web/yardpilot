import { Link } from "react-router";
import {
  TrendingUp,
  FolderOpen,
  Clock,
  DollarSign,
  PlusCircle,
  ChevronRight,
} from "lucide-react";
import { useApp } from "../context/AppContext";

export default function Dashboard() {
  const {
    projects,
    projectsLoading,
    projectsError,
    user,
  } = useApp();

  const active = projects.filter(
    (project) =>
      project.status === "active"
  );
  const completed = projects.filter(
    (project) =>
      project.status === "completed"
  );
  const totalRevenue = projects.reduce(
    (sum, project) =>
      sum + project.totalEstimate,
    0
  );
  const averageEstimate = projects.length
    ? Math.round(
        totalRevenue / projects.length
      )
    : 0;

  const stats = [
    {
      label: "Active Jobs",
      value: active.length,
      icon: FolderOpen,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Completed",
      value: completed.length,
      icon: TrendingUp,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "Pipeline Value",
      value: `$${active
        .reduce(
          (sum, project) =>
            sum + project.totalEstimate,
          0
        )
        .toLocaleString("en-US")}`,
      icon: DollarSign,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Avg. Estimate",
      value: `$${averageEstimate.toLocaleString(
        "en-US"
      )}`,
      icon: Clock,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
  ];

  const recent = [...projects]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() -
        new Date(a.updatedAt).getTime()
    )
    .slice(0, 5);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1
          className="text-2xl font-bold text-gray-900"
          style={{
            fontFamily:
              "'Plus Jakarta Sans', sans-serif",
          }}
        >
          Dashboard
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          {user?.company ||
            "Your YardPilot workspace"}
        </p>
      </div>

      {projectsError && (
        <div className="mb-6 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          Could not load estimates:{" "}
          {projectsError}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map(
          ({
            label,
            value,
            icon: Icon,
            color,
            bg,
          }) => (
            <div
              key={label}
              className="bg-white rounded-xl border border-gray-200 p-5"
            >
              <div
                className={`w-9 h-9 ${bg} ${color} rounded-lg flex items-center justify-center mb-3`}
              >
                <Icon size={18} />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {projectsLoading ? "—" : value}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {label}
              </p>
            </div>
          )
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        <Link
          to="/app/estimate/new"
          className="flex items-center gap-4 bg-green-700 text-white rounded-xl p-5 hover:bg-green-800 transition-colors group"
        >
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
            <PlusCircle size={20} />
          </div>
          <div>
            <p className="font-bold">
              New Estimate
            </p>
            <p className="text-green-200 text-sm">
              Build and save a quote
            </p>
          </div>
          <ChevronRight
            size={18}
            className="ml-auto text-green-300 group-hover:translate-x-1 transition-transform"
          />
        </Link>

        <Link
          to="/app/projects/current"
          className="flex items-center gap-4 bg-white border border-gray-200 text-gray-900 rounded-xl p-5 hover:border-green-300 hover:shadow-sm transition-all group"
        >
          <div className="w-10 h-10 bg-green-50 text-green-700 rounded-lg flex items-center justify-center shrink-0">
            <FolderOpen size={20} />
          </div>
          <div>
            <p className="font-bold">
              Current Jobs
            </p>
            <p className="text-gray-500 text-sm">
              {active.length} active right now
            </p>
          </div>
          <ChevronRight
            size={18}
            className="ml-auto text-gray-300 group-hover:translate-x-1 transition-transform"
          />
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">
            Recent Projects
          </h2>
          {recent.length > 0 && (
            <Link
              to="/app/projects/current"
              className="text-sm text-green-700 hover:underline"
            >
              View all
            </Link>
          )}
        </div>

        {projectsLoading ? (
          <div className="px-6 py-10 text-center text-sm text-gray-400">
            Loading estimates...
          </div>
        ) : recent.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-semibold text-gray-700">
              No estimates yet
            </p>
            <p className="text-sm text-gray-400 mt-1">
              New estimates saved by this
              account will appear here.
            </p>
            <Link
              to="/app/estimate/new"
              className="inline-block mt-4 text-sm font-semibold text-green-700 hover:underline"
            >
              + Create your first estimate
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recent.map((project) => (
              <Link
                key={project.id}
                to={`/app/estimate/${project.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm truncate">
                    {project.name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {project.client ||
                      "No client"}{" "}
                    · {project.projectType}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className="font-bold text-gray-900 text-sm">
                    $
                    {project.totalEstimate.toLocaleString(
                      "en-US"
                    )}
                  </p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      project.status ===
                      "active"
                        ? "bg-green-100 text-green-700"
                        : project.status ===
                            "completed"
                          ? "bg-gray-100 text-gray-600"
                          : "bg-yellow-100 text-yellow-700"
                    }`}
                  >
                    {project.status}
                  </span>
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
    </div>
  );
}
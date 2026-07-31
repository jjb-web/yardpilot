import { Link } from "react-router";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  FileText,
  PlusCircle,
  ReceiptText,
  Users,
} from "lucide-react";
import { useApp } from "../context/AppContext";

function money(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function dateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function Dashboard() {
  const {
    user,
    role,
    authUserId,
    activeWorkspace,
    projects,
    projectsLoading,
    projectsError,
    contacts,
    invoices,
    scheduleEvents,
    followUps,
    jobRequests,
  } = useApp();

  const now = Date.now();
  const isEmployee = role === "employee";
  const activeJobs = projects.filter(
    (project) =>
      project.status === "active" && project.estimateStatus === "accepted"
  );
  const assignedJobs = activeJobs.filter(
    (project) =>
      !isEmployee || project.assignedMemberIds.includes(authUserId ?? "")
  );
  const unassignedJobs = activeJobs.filter(
    (project) => project.assignedMemberIds.length === 0
  );
  const customers = contacts.filter(
    (contact) => contact.contactType === "customer"
  );
  const paidInvoices = invoices.filter(
    (invoice) => invoice.paymentStatus === "paid" || invoice.status === "paid"
  );
  const paidRevenue = paidInvoices.reduce(
    (sum, invoice) => sum + invoice.amount,
    0
  );
  const estimateValue = projects.reduce(
    (sum, project) => sum + project.totalEstimate,
    0
  );
  const dueFollowUps = followUps.filter(
    (followUp) =>
      followUp.status === "pending" &&
      new Date(followUp.dueAt).getTime() <= now
  );
  const upcomingSchedule = scheduleEvents
    .filter(
      (event) =>
        event.status === "scheduled" &&
        new Date(event.startAt).getTime() >= now - 60 * 60 * 1000
    )
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 5);
  const pendingRequests = jobRequests.filter(
    (request) => request.status === "pending"
  );

  const managerStats = [
    {
      label: "Customers",
      value: customers.length,
      icon: Users,
      className: "bg-blue-50 text-blue-700",
    },
    {
      label: "Total Estimates",
      value: projects.length,
      icon: FileText,
      className: "bg-violet-50 text-violet-700",
    },
    {
      label: "Paid Revenue",
      value: money(paidRevenue),
      icon: DollarSign,
      className: "bg-green-50 text-green-700",
    },
    {
      label: "Current Jobs",
      value: activeJobs.length,
      icon: ClipboardList,
      className: "bg-amber-50 text-amber-700",
    },
  ];

  const employeeStats = [
    {
      label: "My Active Jobs",
      value: assignedJobs.length,
      icon: ClipboardList,
      className: "bg-green-50 text-green-700",
    },
    {
      label: "Open Jobs",
      value: unassignedJobs.length,
      icon: PlusCircle,
      className: "bg-blue-50 text-blue-700",
    },
    {
      label: "Upcoming Events",
      value: upcomingSchedule.length,
      icon: CalendarDays,
      className: "bg-violet-50 text-violet-700",
    },
    {
      label: "My Proposals",
      value: pendingRequests.filter(
        (request) => request.requestedBy === authUserId
      ).length,
      icon: CheckCircle2,
      className: "bg-amber-50 text-amber-700",
    },
  ];

  const stats = isEmployee ? employeeStats : managerStats;
  const recentProjects = [...(isEmployee ? activeJobs : projects)]
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    .slice(0, 5);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1
            className="text-2xl font-bold text-gray-900"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            {isEmployee ? "My Work Dashboard" : "Dashboard"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeWorkspace?.name || user?.company || "YardPilot workspace"}
            {role ? ` · ${role.charAt(0).toUpperCase()}${role.slice(1)}` : ""}
          </p>
        </div>
        {!isEmployee && (
          <Link
            to="/app/estimate/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800"
          >
            <PlusCircle size={16} /> New Estimate
          </Link>
        )}
      </div>

      {projectsError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {projectsError}
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {stats.map(({ label, value, icon: Icon, className }) => (
          <div
            key={label}
            className="rounded-xl border border-gray-200 bg-white p-5"
          >
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${className}`}
            >
              <Icon size={19} />
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {projectsLoading ? "—" : value}
            </p>
            <p className="text-xs text-gray-500 mt-1">{label}</p>
          </div>
        ))}
      </div>

      {!isEmployee && (
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Link
            to="/app/estimates"
            className="rounded-xl border border-gray-200 bg-white p-5 hover:border-green-300 hover:shadow-sm transition-all"
          >
            <FileText className="text-green-700 mb-3" size={21} />
            <p className="font-bold text-gray-900">Estimate pipeline</p>
            <p className="text-sm text-gray-500 mt-1">
              {money(estimateValue)} across {projects.length} estimates
            </p>
          </Link>
          <Link
            to="/app/invoices"
            className="rounded-xl border border-gray-200 bg-white p-5 hover:border-green-300 hover:shadow-sm transition-all"
          >
            <ReceiptText className="text-green-700 mb-3" size={21} />
            <p className="font-bold text-gray-900">Invoices</p>
            <p className="text-sm text-gray-500 mt-1">
              {invoices.filter((invoice) => !invoice.archivedAt).length} active
            </p>
          </Link>
          <Link
            to="/app/team"
            className="rounded-xl border border-gray-200 bg-white p-5 hover:border-green-300 hover:shadow-sm transition-all"
          >
            <Users className="text-green-700 mb-3" size={21} />
            <p className="font-bold text-gray-900">Estimate proposals</p>
            <p className="text-sm text-gray-500 mt-1">
              {pendingRequests.length} awaiting review
            </p>
          </Link>
        </div>
      )}

      <div className="grid lg:grid-cols-[1.25fr_.75fr] gap-6">
        <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 className="font-bold text-gray-900">
              {isEmployee ? "Available and Assigned Jobs" : "Recent Estimates & Jobs"}
            </h2>
            <Link
              to="/app/projects/current"
              className="text-sm font-semibold text-green-700 hover:underline"
            >
              View all
            </Link>
          </div>
          {projectsLoading ? (
            <div className="p-10 text-center text-sm text-gray-400">Loading jobs…</div>
          ) : recentProjects.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">
              No jobs or estimates yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentProjects.map((project) => {
                const assignedToMe = project.assignedMemberIds.includes(
                  authUserId ?? ""
                );
                return (
                  <Link
                    key={project.id}
                    to={
                      project.estimateStatus === "accepted"
                        ? `/app/jobs/${project.id}`
                        : `/app/estimates/${project.id}`
                    }
                    className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-900 truncate">
                        {project.name}
                      </p>
                      <p className="text-xs text-gray-500 mt-1 truncate">
                        {project.client || "No client"} · {project.address || "No address"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {isEmployee ? (
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded-full ${
                            assignedToMe
                              ? "bg-green-100 text-green-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {assignedToMe ? "Assigned" : "Open"}
                        </span>
                      ) : (
                        <p className="font-bold text-gray-900">
                          {money(project.totalEstimate)}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <h2 className="font-bold text-gray-900">Upcoming</h2>
            <Link
              to="/app/schedule"
              className="text-sm font-semibold text-green-700 hover:underline"
            >
              Calendar
            </Link>
          </div>
          {upcomingSchedule.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              Nothing scheduled yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {upcomingSchedule.map((event) => (
                <Link
                  key={event.id}
                  to="/app/schedule"
                  className="block px-5 py-4 hover:bg-gray-50"
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {event.title}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {dateTime(event.startAt)}
                  </p>
                </Link>
              ))}
            </div>
          )}
          {dueFollowUps.length > 0 && !isEmployee && (
            <Link
              to="/app/follow-ups"
              className="flex items-center justify-between border-t border-gray-100 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-800"
            >
              <span>{dueFollowUps.length} follow-up reminders are due</span>
              <AlertCircle size={17} />
            </Link>
          )}
        </section>
      </div>
    </div>
  );
}

import { useMemo, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router";
import {
  Download,
  Edit3,
  Eye,
  FileText,
  PlusCircle,
  Search,
  Share2,
  Trash2,
} from "lucide-react";
import CopyToast from "../components/CopyToast";
import { useApp } from "../context/AppContext";
import { useCopyFeedback } from "../hooks/useCopyFeedback";
import type { EstimateStatus, Project } from "../data/types";
import {
  calculateEstimate,
  combinedLaborHours,
  estimateShareUrl,
  formatMoney,
  propertyAddress,
} from "../lib/estimate";

const STATUS_OPTIONS: Array<{ value: "all" | EstimateStatus; label: string }> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "declined", label: "Declined" },
];

function statusClass(status: EstimateStatus) {
  switch (status) {
    case "sent":
      return "bg-blue-100 text-blue-700";
    case "accepted":
      return "bg-green-100 text-green-700";
    case "declined":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

export default function Estimates() {
  const {
    projects,
    projectsLoading,
    projectsError,
    contacts,
    properties,
    setProjectSharing,
    deleteProject,
  } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | EstimateStatus>("all");
  const [actionMessage, setActionMessage] = useState("");
  const { copyText, copiedMessage } = useCopyFeedback();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...projects]
      .filter((project) => {
        if (project.status !== "active" || project.estimateStatus === "accepted") {
          return false;
        }
        if (status !== "all" && project.estimateStatus !== status) return false;
        if (!query) return true;

        const contact = contacts.find((item) => item.id === project.contactId);
        const property = properties.find((item) => item.id === project.propertyId);
        return [
          project.name,
          project.client,
          project.address,
          project.city,
          project.estimateNumber,
          project.projectType,
          contact?.name ?? "",
          property?.name ?? "",
          propertyAddress(property),
        ].some((value) => value.toLowerCase().includes(query));
      })
      .sort(
        (first, second) =>
          new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()
      );
  }, [projects, contacts, properties, search, status]);

  function stop(event: MouseEvent) {
    event.stopPropagation();
  }

  function openDocument(project: Project, print = false) {
    const suffix = print ? "?print=1" : "";
    window.open(`/app/estimates/${project.id}${suffix}`, "_blank", "noopener,noreferrer");
  }

  async function shareEstimate(project: Project) {
    setActionMessage("");
    try {
      const sharedProject =
        project.shareEnabled && project.estimateStatus !== "draft"
          ? project
          : await setProjectSharing(project.id, true);
      const url = estimateShareUrl(sharedProject.shareToken);
      const shareData = {
        title: `${sharedProject.estimateNumber} - ${sharedProject.name}`,
        text: `Landscaping estimate from YardPilotUSA for ${sharedProject.client || sharedProject.name}`,
        url,
      };

      if (navigator.share) {
        await navigator.share(shareData);
        setActionMessage("Estimate marked Sent and shared.");
      } else {
        const copied = await copyText(url, "Public estimate link copied");
        if (!copied) window.prompt("Copy this public estimate link:", url);
        setActionMessage(
          copied
            ? "Estimate marked Sent and public link copied."
            : "Estimate marked Sent. Copy the public link from the prompt."
        );
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setActionMessage(
        error instanceof Error ? error.message : "The estimate could not be shared."
      );
    }
  }

  async function removeEstimate(project: Project) {
    const confirmed = window.confirm(
      `Delete “${project.name}”? This permanently removes the estimate and connected schedule, invoice, assignment, and follow-up records.`
    );
    if (!confirmed) return;

    setActionMessage("");
    try {
      await deleteProject(project.id);
      setActionMessage("Estimate and connected records deleted.");
    } catch (error) {
      setActionMessage(
        error instanceof Error ? error.message : "The estimate could not be deleted."
      );
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            Estimates
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Draft, sent, and declined estimates. Accepted estimates automatically move into Jobs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/app/estimate/new")}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-900 cursor-pointer"
        >
          <PlusCircle size={16} /> Create Estimate
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between mb-6">
        <div className="relative w-full max-w-md">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search estimates, clients, or properties..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
          />
        </div>

        <div className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {STATUS_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.value}
              onClick={() => setStatus(option.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                status === option.value
                  ? "bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-950"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {actionMessage && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
          {actionMessage}
        </div>
      )}

      {projectsError && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          Could not load estimates: {projectsError}
        </div>
      )}

      {projectsLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-14 text-center text-sm text-gray-400">
          Loading estimates...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-14 text-center">
          <FileText size={34} className="mx-auto text-gray-300 mb-3" />
          <p className="font-semibold text-gray-700">No matching estimates</p>
          <p className="text-sm text-gray-400 mt-1">Create an estimate or change the filters.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {filtered.map((project) => {
            const totals = calculateEstimate(project);
            const laborHours = combinedLaborHours(project);
            const contact = contacts.find((item) => item.id === project.contactId);
            const property = properties.find((item) => item.id === project.propertyId);

            return (
              <article
                key={project.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/app/estimate/${project.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    navigate(`/app/estimate/${project.id}`);
                  }
                }}
                className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:border-slate-400 hover:shadow-md transition-all cursor-pointer"
              >
                <div className="grid lg:grid-cols-[1.25fr_1fr_0.9fr]">
                  <div className="p-6 border-b lg:border-b-0 lg:border-r border-gray-100">
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full capitalize ${statusClass(project.estimateStatus)}`}>
                        {project.estimateStatus}
                      </span>
                      <span className="text-xs font-semibold text-gray-400">
                        {project.estimateNumber}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-gray-900">{project.name}</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {contact?.name || project.client || "No client"}
                    </p>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                      {property?.name ? `${property.name} · ` : ""}
                      {propertyAddress(property) || [project.address, project.city].filter(Boolean).join(", ") || "No property address"}
                    </p>
                    {project.scopeDescription && (
                      <p className="text-sm text-gray-600 mt-4 line-clamp-3 leading-relaxed">
                        {project.scopeDescription}
                      </p>
                    )}
                  </div>

                  <div className="p-6 border-b lg:border-b-0 lg:border-r border-gray-100">
                    <p className="text-xs uppercase tracking-wider font-bold text-gray-400 mb-4">
                      Cost breakdown
                    </p>
                    <div className="space-y-2.5 text-sm">
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500">Materials</span>
                        <span className="font-semibold text-gray-900">{formatMoney(totals.materials)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500">Total combined labor hours</span>
                        <span className="font-semibold text-gray-900">
                          {laborHours.toLocaleString("en-US")}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500">Combined labor cost</span>
                        <span className="font-semibold text-gray-900">{formatMoney(totals.labor)}</span>
                      </div>
                      {project.taxRate > 0 && (
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-500">Tax</span>
                          <span className="font-semibold text-gray-900">{formatMoney(totals.tax)}</span>
                        </div>
                      )}
                      {project.discountAmount > 0 && (
                        <div className="flex justify-between gap-4 text-green-700">
                          <span>Discount</span>
                          <span className="font-semibold">-{formatMoney(totals.discount)}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-6 bg-gray-50 flex flex-col justify-between gap-5">
                    <div>
                      <p className="text-xs uppercase tracking-wider font-bold text-gray-400">Total</p>
                      <p className="text-3xl font-extrabold text-slate-800 mt-2">
                        {formatMoney(totals.total)}
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        {project.billingMethod === "hourly"
                          ? "Time & materials · total hours"
                          : "Fixed price · job completion"}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Updated {new Date(project.updatedAt).toLocaleDateString("en-US")}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          stop(event);
                          navigate(`/app/estimates/${project.id}`);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-xs font-semibold hover:bg-gray-100 cursor-pointer"
                      >
                        <Eye size={14} /> View
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          stop(event);
                          navigate(`/app/estimate/${project.id}`);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-xs font-semibold hover:bg-gray-100 cursor-pointer"
                      >
                        <Edit3 size={14} /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          stop(event);
                          openDocument(project, true);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-xs font-semibold hover:bg-gray-100 cursor-pointer"
                      >
                        <Download size={14} /> PDF
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          stop(event);
                          void shareEstimate(project);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 cursor-pointer"
                      >
                        <Share2 size={14} /> Share
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          stop(event);
                          void removeEstimate(project);
                        }}
                        className="col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 bg-white text-red-600 text-xs font-semibold hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 size={14} /> Delete Estimate
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <CopyToast message={copiedMessage} />
    </div>
  );
}

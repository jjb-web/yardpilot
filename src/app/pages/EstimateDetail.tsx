import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Edit3,
  RotateCcw,
  Send,
  Share2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import CopyToast from "../components/CopyToast";
import EstimateDocument from "../components/EstimateDocument";
import { useApp } from "../context/AppContext";
import { useCopyFeedback } from "../hooks/useCopyFeedback";
import { estimateShareUrl } from "../lib/estimate";

function approvalLabel(status: string) {
  if (status === "pending") return "Awaiting internal approval";
  if (status === "approved") return "Internally approved";
  if (status === "changes_requested") return "Changes requested";
  return "Internal draft";
}

function approvalClass(status: string) {
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "changes_requested") return "border-red-200 bg-red-50 text-red-900";
  return "border-slate-200 bg-slate-50 text-slate-800";
}

export default function EstimateDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    user,
    authUserId,
    role,
    projects,
    projectsLoading,
    contacts,
    properties,
    propertyPhotos,
    workspaceMembers,
    setProjectSharing,
    deleteProject,
    submitEstimateForApproval,
    reviewEstimateApproval,
  } = useApp();
  const [message, setMessage] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const { copyText, copiedMessage } = useCopyFeedback();

  const project = projects.find((item) => item.id === id) ?? null;
  const contact = contacts.find((item) => item.id === project?.contactId) ?? null;
  const property = properties.find((item) => item.id === project?.propertyId) ?? null;
  const photos = propertyPhotos.filter((item) => item.propertyId === property?.id);

  const isManager = role === "owner" || role === "co_owner" || role === "manager";
  const creatorMember = workspaceMembers.find((member) => member.userId === project?.createdBy) ?? null;
  const creatorName = creatorMember?.name || (project?.createdBy === authUserId ? user?.name : "Team member");
  const createdByEmployee = creatorMember?.role === "employee" || Boolean(project?.submittedForApprovalBy);
  const isEmployeeOwner = role === "employee" && project?.createdBy === authUserId;
  const canEdit = Boolean(
    isManager ||
      (isEmployeeOwner &&
        project?.estimateStatus === "draft" &&
        ["draft", "changes_requested"].includes(project.internalApprovalStatus))
  );
  const canSubmit = Boolean(
    isEmployeeOwner &&
      project?.estimateStatus === "draft" &&
      ["draft", "changes_requested"].includes(project.internalApprovalStatus)
  );
  const canReviewEmployeeEstimate = Boolean(
    isManager && createdByEmployee && project?.internalApprovalStatus === "pending"
  );
  const backLabel = "Back to Estimates";
  const backAction = () => navigate("/app/estimates", { replace: true });

  const approvalByName = useMemo(() => {
    if (!project?.approvedBy) return "";
    return project.approvedBy === authUserId ? "you" : "a manager";
  }, [project?.approvedBy, authUserId]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [id]);

  useEffect(() => {
    if (!project || searchParams.get("print") !== "1") return;
    const timer = window.setTimeout(() => window.print(), 450);
    return () => window.clearTimeout(timer);
  }, [project?.id, searchParams]);

  async function shareEstimate() {
    if (!project) return;
    setMessage("");

    if (project.internalApprovalStatus !== "approved") {
      setMessage("Approve this estimate internally before sharing it with the client.");
      return;
    }

    try {
      const sharedProject =
        project.shareEnabled && project.estimateStatus !== "draft"
          ? project
          : await setProjectSharing(project.id, true);
      const url = estimateShareUrl(sharedProject.shareToken);
      const data = {
        title: `${sharedProject.estimateNumber} - ${sharedProject.name}`,
        text: `Landscaping estimate for ${sharedProject.client || sharedProject.name}`,
        url,
      };

      if (navigator.share) {
        await navigator.share(data);
        setMessage("Estimate marked Sent and shared.");
      } else {
        const copied = await copyText(url, "Public estimate link copied");
        if (!copied) window.prompt("Copy this public estimate link:", url);
        setMessage(
          copied
            ? "Estimate marked Sent and public link copied."
            : "Estimate marked Sent. Copy the public link from the prompt."
        );
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "Could not share estimate.");
    }
  }

  async function submitForApproval() {
    if (!project) return;
    setBusy(true);
    setMessage("");
    try {
      await submitEstimateForApproval(project.id);
      setMessage("Estimate submitted for internal approval.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit estimate.");
    } finally {
      setBusy(false);
    }
  }

  async function review(decision: "approve" | "changes_requested") {
    if (!project) return;
    setBusy(true);
    setMessage("");
    try {
      await reviewEstimateApproval(project.id, decision, reviewNotes);
      setMessage(
        decision === "approve"
          ? "Estimate approved. It can now be sent to the client."
          : "Estimate returned for changes."
      );
      setReviewNotes("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not review estimate.");
    } finally {
      setBusy(false);
    }
  }

  async function removeEstimate() {
    if (!project) return;
    const confirmed = window.confirm(
      `Delete “${project.name}”? This permanently removes the estimate and its connected schedule, invoice, assignment, and follow-up records.`
    );
    if (!confirmed) return;

    setMessage("");
    try {
      await deleteProject(project.id);
      navigate("/app/estimates", { replace: true });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The estimate could not be deleted."
      );
    }
  }

  if (projectsLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading estimate...</div>;
  }

  if (!project || !user) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <h1 className="text-xl font-bold text-gray-900">Estimate not found</h1>
          <button type="button" onClick={backAction} className="mt-4 text-green-700 font-semibold text-sm">
            {backLabel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="no-print flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <button
          type="button"
          onClick={backAction}
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={16} /> {backLabel}
        </button>

        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Link
              to={`/app/estimate/${project.id}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50"
            >
              <Edit3 size={15} /> Edit
            </Link>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50"
          >
            <Download size={15} /> Download PDF
          </button>
          {isManager && (
            <button
              type="button"
              onClick={() => void shareEstimate()}
              disabled={project.internalApprovalStatus !== "approved"}
              title={project.internalApprovalStatus !== "approved" ? "Internal approval required" : undefined}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Share2 size={15} /> Share
            </button>
          )}
          {isManager && (
            <button
              type="button"
              onClick={() => void removeEstimate()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 bg-white text-red-600 text-sm font-semibold hover:bg-red-50"
            >
              <Trash2 size={15} /> Delete
            </button>
          )}
        </div>
      </div>

      <section className={`no-print mb-5 rounded-xl border p-4 ${approvalClass(project.internalApprovalStatus)}`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 font-bold">
              <ShieldCheck size={18} /> {createdByEmployee
                ? approvalLabel(project.internalApprovalStatus)
                : `Internal review not required · created by ${creatorName}`}
            </div>
            <p className="mt-1 text-sm opacity-80">
              {createdByEmployee
                ? "Employee-created estimates require a manager review before they can be shared. Customer acceptance remains separate."
                : "Owner, co-owner, and manager-created estimates are approved at creation. Customer acceptance remains separate."}
            </p>
            {project.approvedAt && (
              <p className="mt-2 text-xs opacity-70">
                Approved {new Date(project.approvedAt).toLocaleString()}{approvalByName ? ` by ${approvalByName}` : ""}.
              </p>
            )}
            {project.approvalNotes && (
              <p className="mt-3 whitespace-pre-line rounded-lg bg-white/60 px-3 py-2 text-sm">
                {project.approvalNotes}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-3 lg:w-[360px]">
            {canSubmit && (
              <button
                type="button"
                onClick={() => void submitForApproval()}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Send size={15} /> Submit for approval
              </button>
            )}

            {canReviewEmployeeEstimate && (
              <>
                <textarea
                  value={reviewNotes}
                  onChange={(event) => setReviewNotes(event.target.value)}
                  rows={3}
                  placeholder="Approval note or requested changes"
                  className="w-full rounded-lg border border-current/20 bg-white px-3 py-2 text-sm text-slate-900"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void review("approve")}
                    disabled={busy}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <CheckCircle2 size={15} /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => void review("changes_requested")}
                    disabled={busy}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50"
                  >
                    <RotateCcw size={15} /> Request changes
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {message && (
        <div className="no-print mb-5 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800">
          {message}
        </div>
      )}

      <EstimateDocument
        project={project}
        company={user}
        contact={contact}
        property={property}
        photos={photos}
      />

      <div className="no-print mt-6 flex justify-center">
        <button
          type="button"
          onClick={backAction}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft size={16} /> {backLabel}
        </button>
      </div>
      <CopyToast message={copiedMessage} />
    </div>
  );
}

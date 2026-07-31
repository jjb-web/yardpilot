import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, Download, Edit3, Share2, Trash2 } from "lucide-react";
import CopyToast from "../components/CopyToast";
import EstimateDocument from "../components/EstimateDocument";
import { useApp } from "../context/AppContext";
import { useCopyFeedback } from "../hooks/useCopyFeedback";
import { estimateShareUrl } from "../lib/estimate";

export default function EstimateDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    user,
    projects,
    projectsLoading,
    contacts,
    properties,
    propertyPhotos,
    setProjectSharing,
    deleteProject,
  } = useApp();
  const [message, setMessage] = useState("");
  const { copyText, copiedMessage } = useCopyFeedback();

  const project = projects.find((item) => item.id === id) ?? null;
  const contact = contacts.find((item) => item.id === project?.contactId) ?? null;
  const property = properties.find((item) => item.id === project?.propertyId) ?? null;
  const photos = propertyPhotos.filter((item) => item.propertyId === property?.id);

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
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mt-4 text-green-700 font-semibold text-sm cursor-pointer"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="no-print flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div className="flex flex-wrap gap-2">
          <Link
            to={`/app/estimate/${project.id}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50"
          >
            <Edit3 size={15} /> Edit
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 cursor-pointer"
          >
            <Download size={15} /> Download PDF
          </button>
          <button
            type="button"
            onClick={() => void shareEstimate()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900 cursor-pointer"
          >
            <Share2 size={15} /> Share
          </button>
          <button
            type="button"
            onClick={() => void removeEstimate()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 bg-white text-red-600 text-sm font-semibold hover:bg-red-50 cursor-pointer"
          >
            <Trash2 size={15} /> Delete
          </button>
        </div>
      </div>

      {message && (
        <div className="no-print mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
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
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft size={16} /> Back
        </button>
      </div>
      <CopyToast message={copiedMessage} />
    </div>
  );
}

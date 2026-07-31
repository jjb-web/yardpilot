import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Image as ImageIcon,
  Mail,
  MapPin,
  Phone,
  UserRound,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type { EstimateJob } from "../data/types";

function dateTime(value: string | null) {
  if (!value) return "Not scheduled";
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    authUserId,
    role,
    projects,
    projectsLoading,
    workspaceMembers,
    contacts,
    properties,
    propertyPhotos,
    assignSelfToProject,
  } = useApp();

  const project = projects.find((item) => item.id === id) ?? null;
  const linkedContact = project
    ? project.contactDetails ?? contacts.find((item) => item.id === project.contactId) ?? null
    : null;
  const linkedProperty = project
    ? project.propertyDetails ?? properties.find((item) => item.id === project.propertyId) ?? null
    : null;

  if (projectsLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading job…</div>;
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          <h1 className="text-xl font-bold text-gray-900">Job not found</h1>
          <button type="button" onClick={() => navigate(-1)} className="mt-4 text-sm font-semibold text-green-700">Back</button>
        </div>
      </div>
    );
  }

  const fallback: EstimateJob = {
    id: "legacy-job",
    title: project.name,
    projectType: project.projectType,
    scopeDescription: project.scopeDescription,
    internalNotes: project.notes,
    squareFootage: project.squareFootage,
    pricePerSquareFoot: 0,
    scheduledStart: project.scheduledStart,
    scheduledEnd: project.scheduledEnd,
    laborRate: project.laborRate,
    laborHours: project.laborHours,
    laborAssignments: project.laborAssignments,
    lineItems: project.lineItems,
    photoIds: [],
  };
  const jobs = project.jobSections?.length ? project.jobSections : [fallback];
  const isAssigned = Boolean(authUserId && project.assignedMemberIds.includes(authUserId));
  const canClaim = role === "employee" && project.assignedMemberIds.length === 0 && project.status === "active";
  const isPast = project.status === "completed" || project.status === "archived";
  const serviceAddress = [
    linkedProperty?.address || linkedContact?.address || project.address,
    linkedProperty?.city || linkedContact?.city || project.city,
    linkedProperty?.state || linkedContact?.state,
    linkedProperty?.zip || linkedContact?.zip,
  ].filter(Boolean).join(", ");
  const linkedPropertyPhotos = propertyPhotos.filter(
    (photo) => photo.propertyId === (linkedProperty?.id || project.propertyId)
  );

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900">
          <ArrowLeft size={15} /> Back
        </button>
        {role !== "employee" && (
          <button type="button" onClick={() => navigate(`/app/estimates/${project.id}`)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700">
            <FileText size={15} /> {isPast ? "Show archived estimate" : "Show estimate"}
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="bg-green-950 p-7 text-white">
          <div className="flex flex-col gap-5 md:flex-row md:items-start">
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-wider text-green-300">{isPast ? "Past job" : "Current job"}</p>
              <h1 className="mt-2 text-3xl font-bold">{project.name}</h1>
              <p className="mt-2 text-green-100">{linkedContact?.name || project.client || "No customer listed"}</p>
              <p className="mt-1 text-sm text-green-200">{jobs.length} {jobs.length === 1 ? "separate job" : "separate jobs"}</p>
            </div>
            {isAssigned && !isPast && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/20 px-3 py-1.5 text-sm font-semibold text-green-200"><CheckCircle2 size={15} /> Assigned to you</span>
            )}
            {canClaim && (
              <button type="button" onClick={() => void assignSelfToProject(project.id)} className="rounded-lg bg-green-500 px-4 py-2.5 text-sm font-bold text-green-950">Claim this job</button>
            )}
          </div>
        </div>

        <div className="grid gap-7 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_290px]">
          <main className="space-y-5">
            {jobs.map((job, index) => {
              const assigned = job.laborAssignments
                .map((assignment) => workspaceMembers.find((member) => member.userId === assignment.userId))
                .filter(Boolean);
              const hours = job.laborAssignments.length
                ? job.laborAssignments.reduce((sum, assignment) => sum + Number(assignment.hours || 0), 0)
                : job.laborHours;
              const selectedJobPhotos = propertyPhotos.filter((photo) => job.photoIds.includes(photo.id));
              const photos = selectedJobPhotos.length ? selectedJobPhotos : linkedPropertyPhotos;
              return (
                <section key={job.id} className="overflow-hidden rounded-xl border border-gray-200">
                  <header className="bg-gray-50 px-5 py-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Job {index + 1}</p>
                    <h2 className="mt-1 text-xl font-bold text-gray-900">{job.title}</h2>
                    <p className="mt-1 text-sm text-gray-500">{job.projectType}</p>
                  </header>
                  <div className="space-y-5 p-5">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">Work to complete</h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">{job.scopeDescription || "No scope description has been added."}</p>
                    </div>
                    {job.internalNotes && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                        <h3 className="text-sm font-bold text-amber-900">Internal instructions</h3>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-800">{job.internalNotes}</p>
                      </div>
                    )}
                    {(job.lineItems.length > 0 || job.squareFootage > 0) && (
                      <div>
                        <h3 className="mb-2 text-sm font-bold text-gray-900">Materials and tasks</h3>
                        <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                          {job.squareFootage > 0 && <div className="flex justify-between gap-4 px-4 py-3 text-sm"><span>Square-foot work</span><span className="text-gray-500">{job.squareFootage.toLocaleString()} sq ft</span></div>}
                          {job.lineItems.map((item) => <div key={item.id} className="flex justify-between gap-4 px-4 py-3 text-sm"><span className="font-semibold text-gray-800">{item.description || "Material or service"}</span><span className="shrink-0 text-gray-500">{item.qty} {item.unit}</span></div>)}
                        </div>
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-gray-200 p-4"><div className="flex items-center gap-2 text-gray-500"><CalendarDays size={15} /><span className="text-xs font-bold uppercase">Start</span></div><p className="mt-2 text-sm font-semibold">{dateTime(job.scheduledStart)}</p></div>
                      <div className="rounded-lg border border-gray-200 p-4"><div className="flex items-center gap-2 text-gray-500"><Clock3 size={15} /><span className="text-xs font-bold uppercase">Expected time</span></div><p className="mt-2 text-sm font-semibold">{hours.toLocaleString()} crew hours</p></div>
                      <div className="rounded-lg border border-gray-200 p-4"><div className="flex items-center gap-2 text-gray-500"><UserRound size={15} /><span className="text-xs font-bold uppercase">Crew</span></div><p className="mt-2 text-sm font-semibold">{assigned.length ? assigned.map((member) => member!.name).join(", ") : "Unassigned"}</p></div>
                    </div>
                    {photos.length > 0 && (
                      <div>
                        <div className="mb-2 flex items-center gap-2"><ImageIcon size={15} className="text-gray-500" /><h3 className="text-sm font-bold">Photos</h3></div>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{photos.map((photo) => <figure key={photo.id} className="overflow-hidden rounded-lg border border-gray-200"><img src={photo.url} alt={photo.caption || job.title} className="aspect-[4/3] w-full object-cover" />{photo.caption && <figcaption className="p-2 text-xs text-gray-500">{photo.caption}</figcaption>}</figure>)}</div>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </main>

          <aside className="space-y-4">
            <div className="rounded-xl border border-gray-200 p-5">
              <div className="mb-2 flex items-center gap-2 text-gray-500"><MapPin size={16} /><span className="text-xs font-bold uppercase tracking-wide">Property and location</span></div>
              {linkedProperty?.name && <p className="font-semibold text-gray-900">{linkedProperty.name}</p>}
              <p className="mt-1 text-sm text-gray-700">{serviceAddress || "No address listed"}</p>
              {linkedProperty?.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-600">{linkedProperty.description}</p>}
            </div>

            <div className="rounded-xl border border-gray-200 p-5">
              <div className="mb-3 flex items-center gap-2 text-gray-500"><UserRound size={16} /><span className="text-xs font-bold uppercase tracking-wide">Customer contact</span></div>
              <p className="font-semibold text-gray-900">{linkedContact?.name || project.client || "No customer listed"}</p>
              {linkedContact?.phone && <a href={`tel:${linkedContact.phone}`} className="mt-2 flex items-center gap-2 text-sm text-slate-700"><Phone size={14} /> {linkedContact.phone}</a>}
              {linkedContact?.email && <a href={`mailto:${linkedContact.email}`} className="mt-2 flex items-center gap-2 break-all text-sm text-slate-700"><Mail size={14} /> {linkedContact.email}</a>}
              {linkedContact?.notes && <div className="mt-4 border-t border-gray-100 pt-3"><p className="text-xs font-bold uppercase tracking-wide text-gray-400">Contact notes</p><p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{linkedContact.notes}</p></div>}
            </div>

            {linkedProperty?.internalNotes && <div className="rounded-xl border border-amber-200 bg-amber-50 p-5"><div className="flex items-center gap-2 text-amber-800"><Building2 size={15} /><p className="text-xs font-bold uppercase tracking-wide">Property internal notes</p></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-900">{linkedProperty.internalNotes}</p></div>}
            {(linkedProperty?.clientNotes || project.clientNotes) && <div className="rounded-xl border border-gray-200 p-5"><p className="text-xs font-bold uppercase tracking-wide text-gray-500">Customer notes</p><div className="mt-2 space-y-2 whitespace-pre-wrap text-sm text-gray-700">{linkedProperty?.clientNotes && <p>{linkedProperty.clientNotes}</p>}{project.clientNotes && <p>{project.clientNotes}</p>}</div></div>}
            <div className="rounded-xl bg-gray-50 p-5 text-xs leading-5 text-gray-500">This job view focuses on instructions, schedule, crew, materials, saved customer details, property notes, location, and photos. Estimate pricing and customer-facing terms remain in the linked estimate.</div>
          </aside>
        </div>
      </div>
    </div>
  );
}

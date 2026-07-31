import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Link } from "react-router";
import {
  Building2,
  Check,
  FileText,
  Image as ImageIcon,
  Link2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type {
  Contact,
  ContactActivity,
  ContactType,
  Project,
  Property,
  PropertyPhoto,
} from "../data/types";
import { formatMoney, propertyAddress } from "../lib/estimate";

const CONTACT_TYPE_OPTIONS: Array<{
  value: ContactType;
  label: string;
}> = [
  { value: "lead", label: "Lead" },
  { value: "customer", label: "Customer" },
];

const ACTIVITY_OPTIONS: Array<{
  value: ContactActivity;
  label: string;
}> = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const SOURCE_OPTIONS = [
  "",
  "Referral",
  "Website",
  "Google",
  "Social Media",
  "Repeat Customer",
  "Other",
];

type ContactDraft = Omit<
  Contact,
  "id" | "workspaceId" | "createdAt" | "updatedAt"
>;

type PropertyDraft = Omit<
  Property,
  "id" | "workspaceId" | "contactId" | "createdAt" | "updatedAt"
>;

type StagedProperty = {
  key: string;
  draft: PropertyDraft;
  files: File[];
  projectIds: string[];
};

function uid() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2, 11)
  );
}

function emptyContact(): ContactDraft {
  return {
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    contactType: "lead",
    activityStatus: "active",
    source: "",
    notes: "",
  };
}

function emptyProperty(): PropertyDraft {
  return {
    name: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    description: "",
    internalNotes: "",
    clientNotes: "",
  };
}

function emptyStagedProperty(): StagedProperty {
  return {
    key: uid(),
    draft: emptyProperty(),
    files: [],
    projectIds: [],
  };
}

function hasPropertyData(property: StagedProperty) {
  return (
    Object.values(property.draft).some((value) => value.trim() !== "") ||
    property.files.length > 0 ||
    property.projectIds.length > 0
  );
}

function contactAddress(contact: Contact) {
  const cityStateZip = [contact.city, contact.state, contact.zip]
    .filter(Boolean)
    .join(" ");
  return [contact.address, cityStateZip].filter(Boolean).join(", ");
}

function typeClasses(type: ContactType) {
  return type === "customer"
    ? "bg-blue-100 text-blue-700"
    : "bg-amber-100 text-amber-700";
}

function activityClasses(status: ContactActivity) {
  return status === "active"
    ? "bg-emerald-100 text-emerald-700"
    : "bg-gray-100 text-gray-600";
}

function StagedPhotos({
  files,
  onRemove,
}: {
  files: File[];
  onRemove: (index: number) => void;
}) {
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const next = files.map((file) => URL.createObjectURL(file));
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  if (!files.length) return null;

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {files.map((file, index) => (
        <div
          key={`${file.name}-${file.lastModified}-${index}`}
          className="relative"
        >
          <img
            src={urls[index]}
            alt={file.name}
            className="aspect-square w-full rounded-lg border border-gray-200 object-cover"
          />
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="absolute right-2 top-2 rounded-md bg-black/70 p-1.5 text-white"
            aria-label={`Remove ${file.name}`}
          >
            <X size={14} />
          </button>
          <p className="mt-1 truncate text-[11px] text-gray-500">
            {file.name}
          </p>
        </div>
      ))}
    </div>
  );
}

function RecordPicker({
  projects,
  selectedIds,
  onToggle,
}: {
  projects: Project[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  if (!projects.length) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-400">
        No existing estimates or jobs are available to link.
      </p>
    );
  }

  return (
    <div className="max-h-64 divide-y divide-gray-100 overflow-y-auto overscroll-contain rounded-xl border border-gray-200">
      {projects.map((project) => {
        const checked = selectedIds.includes(project.id);
        return (
          <button
            key={project.id}
            type="button"
            onClick={() => onToggle(project.id)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                checked
                  ? "border-slate-700 bg-slate-700 text-white"
                  : "border-gray-300 bg-white"
              }`}
            >
              {checked && <Check size={13} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">
                {project.name}
              </p>
              <p className="text-xs text-gray-500">
                {project.estimateNumber} · {project.estimateStatus} ·{" "}
                {formatMoney(project.totalEstimate)}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function PhotoGrid({
  photos,
  onDelete,
}: {
  photos: PropertyPhoto[];
  onDelete: (photo: PropertyPhoto) => void;
}) {
  if (!photos.length) return null;
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {photos.map((photo) => (
        <div key={photo.id} className="relative">
          <img
            src={photo.url}
            alt={photo.caption || "Property"}
            className="aspect-square w-full rounded-lg border border-gray-200 object-cover"
          />
          <button
            type="button"
            onClick={() => onDelete(photo)}
            className="absolute right-2 top-2 rounded-md bg-black/70 p-1.5 text-white"
            aria-label="Delete photo"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function Contacts() {
  const {
    activeWorkspaceId,
    contacts,
    contactsLoading,
    contactsError,
    projects,
    properties,
    propertyPhotos,
    propertiesError,
    addContact,
    updateContact,
    deleteContact,
    addProperty,
    updateProperty,
    deleteProperty,
    uploadPropertyPhoto,
    deletePropertyPhoto,
    updateProject,
  } = useApp();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ContactType>("all");
  const [activityFilter, setActivityFilter] =
    useState<"all" | ContactActivity>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] =
    useState<"details" | "properties" | "history">("details");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [draft, setDraft] = useState<ContactDraft>(emptyContact);
  const [stagedProperties, setStagedProperties] = useState<StagedProperty[]>([
    emptyStagedProperty(),
  ]);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  const [propertyModalOpen, setPropertyModalOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] =
    useState<Property | null>(null);
  const [propertyDraft, setPropertyDraft] =
    useState<PropertyDraft>(emptyProperty);
  const [propertyFiles, setPropertyFiles] = useState<File[]>([]);
  const [propertyProjectIds, setPropertyProjectIds] = useState<string[]>([]);
  const [propertySaving, setPropertySaving] = useState(false);
  const [propertyError, setPropertyError] = useState("");

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...contacts]
      .filter((contact) => {
        if (
          typeFilter !== "all" &&
          contact.contactType !== typeFilter
        ) {
          return false;
        }
        if (
          activityFilter !== "all" &&
          contact.activityStatus !== activityFilter
        ) {
          return false;
        }
        if (!query) return true;
        return [
          contact.name,
          contact.email,
          contact.phone,
          contact.address,
          contact.city,
          contact.state,
          contact.zip,
          contact.source,
        ].some((value) => value.toLowerCase().includes(query));
      })
      .sort((first, second) => {
        if (first.activityStatus !== second.activityStatus) {
          return first.activityStatus === "active" ? -1 : 1;
        }
        return (
          new Date(second.updatedAt).getTime() -
          new Date(first.updatedAt).getTime()
        );
      });
  }, [contacts, search, typeFilter, activityFilter]);

  const selectedProperties = properties
    .filter((property) => property.contactId === selected?.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const selectedContactProjects = projects
    .filter((project) => project.contactId === selected?.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const selectedPropertyPhotos = propertyPhotos.filter(
    (photo) => photo.propertyId === selectedProperty?.id
  );
  const linkableProjects = projects.filter(
    (project) => !project.contactId || project.contactId === selected?.id
  );

  const inputClass =
    "w-full min-h-11 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-slate-500/25 sm:text-sm";
  const labelClass =
    "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500";

  function setContactField<K extends keyof ContactDraft>(
    key: K,
    value: ContactDraft[K]
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateStagedProperty(
    key: string,
    updater: (property: StagedProperty) => StagedProperty
  ) {
    setStagedProperties((current) =>
      current.map((property) =>
        property.key === key ? updater(property) : property
      )
    );
  }

  function setStagedField<K extends keyof PropertyDraft>(
    propertyKey: string,
    field: K,
    value: PropertyDraft[K]
  ) {
    updateStagedProperty(propertyKey, (property) => ({
      ...property,
      draft: { ...property.draft, [field]: value },
    }));
  }

  function toggleArrayId(
    id: string,
    setter: Dispatch<SetStateAction<string[]>>
  ) {
    setter((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );
  }

  function resetContactModal() {
    setSelected(null);
    setDraft(emptyContact());
    setStagedProperties([emptyStagedProperty()]);
    setActiveTab("details");
    setModalError("");
  }

  function openNewContact() {
    resetContactModal();
    setModalOpen(true);
  }

  function openContact(contact: Contact) {
    setSelected(contact);
    setDraft({
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      address: contact.address,
      city: contact.city,
      state: contact.state,
      zip: contact.zip,
      contactType: contact.contactType,
      activityStatus: contact.activityStatus,
      source: contact.source,
      notes: contact.notes,
    });
    setStagedProperties([emptyStagedProperty()]);
    setActiveTab("details");
    setModalError("");
    setModalOpen(true);
  }

  function closeContactModal() {
    if (saving || propertySaving) return;
    setModalOpen(false);
    resetContactModal();
  }

  async function linkProjects(
    ids: string[],
    contact: Contact,
    property: Property | null
  ) {
    const now = new Date().toISOString();
    for (const projectId of ids) {
      const project = projects.find((item) => item.id === projectId);
      if (!project) continue;
      await updateProject({
        ...project,
        client: contact.name || project.client,
        contactId: contact.id,
        propertyId: property?.id ?? null,
        address: property?.address || contact.address || project.address,
        city: property?.city || contact.city || project.city,
        updatedAt: now,
      });
    }
  }

  async function uploadFiles(propertyId: string, files: File[]) {
    for (const file of files) {
      await uploadPropertyPhoto(propertyId, file);
    }
  }

  async function saveContact() {
    setModalError("");
    if (!draft.name.trim()) {
      setModalError("Enter a contact name before saving.");
      setActiveTab("details");
      return;
    }
    if (!activeWorkspaceId) {
      setModalError("Workspace is still loading.");
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    try {
      const savedContact = selected
        ? await updateContact({
            ...selected,
            ...draft,
            name: draft.name.trim(),
            email: draft.email.trim(),
            phone: draft.phone.trim(),
            address: draft.address.trim(),
            city: draft.city.trim(),
            state: draft.state.trim(),
            zip: draft.zip.trim(),
            source: draft.source.trim(),
            updatedAt: now,
          })
        : await addContact({
            id: uid(),
            workspaceId: activeWorkspaceId,
            ...draft,
            name: draft.name.trim(),
            email: draft.email.trim(),
            phone: draft.phone.trim(),
            address: draft.address.trim(),
            city: draft.city.trim(),
            state: draft.state.trim(),
            zip: draft.zip.trim(),
            source: draft.source.trim(),
            createdAt: now,
            updatedAt: now,
          });

      if (!selected) {
        for (const [index, staged] of stagedProperties.entries()) {
          if (!hasPropertyData(staged)) continue;
          const createdProperty = await addProperty({
            id: uid(),
            workspaceId: activeWorkspaceId,
            contactId: savedContact.id,
            ...staged.draft,
            name:
              staged.draft.name.trim() ||
              (index === 0 ? "Primary Property" : `Property ${index + 1}`),
            address: staged.draft.address.trim(),
            city: staged.draft.city.trim(),
            state: staged.draft.state.trim(),
            zip: staged.draft.zip.trim(),
            description: staged.draft.description.trim(),
            internalNotes: staged.draft.internalNotes.trim(),
            clientNotes: staged.draft.clientNotes.trim(),
            createdAt: now,
            updatedAt: now,
          });
          await uploadFiles(createdProperty.id, staged.files);
          if (staged.projectIds.length) {
            await linkProjects(
              staged.projectIds,
              savedContact,
              createdProperty
            );
          }
        }
      }

      setSearch("");
      setModalOpen(false);
      resetContactModal();
    } catch (error) {
      setModalError(
        error instanceof Error
          ? error.message
          : "The contact could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }

  async function removeContact() {
    if (!selected) return;
    if (
      !window.confirm(
        `Delete ${selected.name} and their linked properties?`
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await deleteContact(selected.id);
      setModalOpen(false);
      resetContactModal();
    } catch (error) {
      setModalError(
        error instanceof Error
          ? error.message
          : "The contact could not be deleted."
      );
    } finally {
      setSaving(false);
    }
  }

  function openNewProperty() {
    setSelectedProperty(null);
    setPropertyDraft(emptyProperty());
    setPropertyFiles([]);
    setPropertyProjectIds([]);
    setPropertyError("");
    setPropertyModalOpen(true);
  }

  function openProperty(property: Property) {
    setSelectedProperty(property);
    setPropertyDraft({
      name: property.name,
      address: property.address,
      city: property.city,
      state: property.state,
      zip: property.zip,
      description: property.description,
      internalNotes: property.internalNotes,
      clientNotes: property.clientNotes,
    });
    setPropertyFiles([]);
    setPropertyProjectIds(
      projects
        .filter((project) => project.propertyId === property.id)
        .map((project) => project.id)
    );
    setPropertyError("");
    setPropertyModalOpen(true);
  }

  function closePropertyModal() {
    if (propertySaving) return;
    setPropertyModalOpen(false);
    setSelectedProperty(null);
    setPropertyDraft(emptyProperty());
    setPropertyFiles([]);
    setPropertyProjectIds([]);
    setPropertyError("");
  }

  async function saveProperty() {
    if (!selected || !activeWorkspaceId) return;
    setPropertyError("");
    if (
      !propertyDraft.name.trim() &&
      !propertyDraft.address.trim() &&
      propertyFiles.length === 0 &&
      propertyProjectIds.length === 0
    ) {
      setPropertyError(
        "Enter a property name or address, choose a photo, or link a record."
      );
      return;
    }

    setPropertySaving(true);
    const now = new Date().toISOString();
    try {
      const savedProperty = selectedProperty
        ? await updateProperty({
            ...selectedProperty,
            ...propertyDraft,
            name: propertyDraft.name.trim() || "Property",
            address: propertyDraft.address.trim(),
            city: propertyDraft.city.trim(),
            state: propertyDraft.state.trim(),
            zip: propertyDraft.zip.trim(),
            description: propertyDraft.description.trim(),
            internalNotes: propertyDraft.internalNotes.trim(),
            clientNotes: propertyDraft.clientNotes.trim(),
            updatedAt: now,
          })
        : await addProperty({
            id: uid(),
            workspaceId: activeWorkspaceId,
            contactId: selected.id,
            ...propertyDraft,
            name: propertyDraft.name.trim() || "Property",
            address: propertyDraft.address.trim(),
            city: propertyDraft.city.trim(),
            state: propertyDraft.state.trim(),
            zip: propertyDraft.zip.trim(),
            description: propertyDraft.description.trim(),
            internalNotes: propertyDraft.internalNotes.trim(),
            clientNotes: propertyDraft.clientNotes.trim(),
            createdAt: now,
            updatedAt: now,
          });

      await uploadFiles(savedProperty.id, propertyFiles);

      if (selectedProperty) {
        const previouslyLinked = projects.filter(
          (project) => project.propertyId === selectedProperty.id
        );
        for (const project of previouslyLinked) {
          if (propertyProjectIds.includes(project.id)) continue;
          await updateProject({
            ...project,
            propertyId: null,
            contactId: selected.id,
            updatedAt: now,
          });
        }
      }
      await linkProjects(propertyProjectIds, selected, savedProperty);
      closePropertyModal();
    } catch (error) {
      setPropertyError(
        error instanceof Error
          ? error.message
          : "The property could not be saved."
      );
    } finally {
      setPropertySaving(false);
    }
  }

  async function removeProperty() {
    if (!selectedProperty) return;
    if (!window.confirm(`Delete ${selectedProperty.name}?`)) return;
    setPropertySaving(true);
    try {
      await deleteProperty(selectedProperty.id);
      closePropertyModal();
    } catch (error) {
      setPropertyError(
        error instanceof Error
          ? error.message
          : "The property could not be deleted."
      );
    } finally {
      setPropertySaving(false);
    }
  }

  async function removePhoto(photo: PropertyPhoto) {
    if (!window.confirm("Delete this property photo?")) return;
    try {
      await deletePropertyPhoto(photo);
    } catch (error) {
      setPropertyError(
        error instanceof Error
          ? error.message
          : "The photo could not be deleted."
      );
    }
  }

  function propertyEditor(
    property: StagedProperty,
    index: number
  ) {
    const updateFiles = (files: File[]) =>
      updateStagedProperty(property.key, (current) => ({
        ...current,
        files,
      }));
    const updateProjectIds = (projectIds: string[]) =>
      updateStagedProperty(property.key, (current) => ({
        ...current,
        projectIds,
      }));

    return (
      <section
        key={property.key}
        className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-gray-900">
              Property {index + 1}
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Details, photos, and linked records are optional.
            </p>
          </div>
          {stagedProperties.length > 1 && (
            <button
              type="button"
              onClick={() =>
                setStagedProperties((current) =>
                  current.filter((item) => item.key !== property.key)
                )
              }
              className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
              aria-label={`Remove property ${index + 1}`}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>Property Name / Label</label>
            <input
              value={property.draft.name}
              onChange={(event) =>
                setStagedField(property.key, "name", event.target.value)
              }
              placeholder="Primary Home, Rental, Commercial Site…"
              className={inputClass}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Street Address</label>
            <input
              value={property.draft.address}
              onChange={(event) =>
                setStagedField(property.key, "address", event.target.value)
              }
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>City</label>
            <input
              value={property.draft.city}
              onChange={(event) =>
                setStagedField(property.key, "city", event.target.value)
              }
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>State</label>
              <input
                value={property.draft.state}
                onChange={(event) =>
                  setStagedField(property.key, "state", event.target.value)
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>ZIP</label>
              <input
                value={property.draft.zip}
                onChange={(event) =>
                  setStagedField(property.key, "zip", event.target.value)
                }
                className={inputClass}
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Property Description</label>
            <textarea
              rows={3}
              value={property.draft.description}
              onChange={(event) =>
                setStagedField(
                  property.key,
                  "description",
                  event.target.value
                )
              }
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Client-visible Notes</label>
            <textarea
              rows={4}
              value={property.draft.clientNotes}
              onChange={(event) =>
                setStagedField(
                  property.key,
                  "clientNotes",
                  event.target.value
                )
              }
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Internal Notes</label>
            <textarea
              rows={4}
              value={property.draft.internalNotes}
              onChange={(event) =>
                setStagedField(
                  property.key,
                  "internalNotes",
                  event.target.value
                )
              }
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-6 border-t border-gray-100 pt-5">
          <div className="mb-3 flex items-center gap-2">
            <ImageIcon size={17} className="text-slate-600" />
            <h4 className="font-semibold text-gray-900">Photos</h4>
          </div>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm font-semibold text-gray-600 hover:border-slate-400">
            <Upload size={17} /> Choose Photos
            <input
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              className="sr-only"
              onChange={(event) => {
                const files = Array.from(
                  event.currentTarget.files ?? []
                ) as File[];
                updateFiles([...property.files, ...files]);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <StagedPhotos
            files={property.files}
            onRemove={(fileIndex) =>
              updateFiles(
                property.files.filter((_, indexValue) =>
                  indexValue !== fileIndex
                )
              )
            }
          />
        </div>

        <div className="mt-6 border-t border-gray-100 pt-5">
          <div className="mb-3 flex items-center gap-2">
            <Link2 size={17} className="text-slate-600" />
            <h4 className="font-semibold text-gray-900">
              Link Existing Estimates or Jobs
            </h4>
          </div>
          <RecordPicker
            projects={linkableProjects}
            selectedIds={property.projectIds}
            onToggle={(id) =>
              updateProjectIds(
                property.projectIds.includes(id)
                  ? property.projectIds.filter((value) => value !== id)
                  : [...property.projectIds, id]
              )
            }
          />
        </div>
      </section>
    );
  }

  const tabs = selected
    ? ([
        ["details", "Contact Details"],
        ["properties", "Properties"],
        ["history", "History"],
      ] as const)
    : ([
        ["details", "Contact Details"],
        ["properties", "Properties & History"],
      ] as const);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Customers, leads, properties, photos, and connected records.
          </p>
        </div>
        <button
          type="button"
          onClick={openNewContact}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900"
        >
          <Plus size={16} /> Add Contact
        </button>
      </div>

      {(contactsError || propertiesError) && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {contactsError || propertiesError}
        </div>
      )}

      <div className="mb-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="relative">
          <Search
            size={17}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            name="yardpilot-contact-search"
            type="search"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, phone, or address…"
            className={`${inputClass} pl-10`}
          />
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-white p-1">
          {(["all", "lead", "customer"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTypeFilter(value)}
              className={`rounded-md px-3 py-2 text-xs font-semibold capitalize ${
                typeFilter === value
                  ? "bg-slate-800 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-gray-200 bg-white p-1">
          {(["all", "active", "inactive"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setActivityFilter(value)}
              className={`rounded-md px-3 py-2 text-xs font-semibold capitalize ${
                activityFilter === value
                  ? "bg-slate-800 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {contactsLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-16 text-center text-sm text-gray-400">
          Loading contacts…
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-16 text-center">
          <UserRound size={34} className="mx-auto text-gray-300" />
          <p className="mt-3 font-semibold text-gray-700">
            No matching contacts
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredContacts.map((contact) => {
            const address = contactAddress(contact);
            const propertyCount = properties.filter(
              (property) => property.contactId === contact.id
            ).length;
            return (
              <button
                key={contact.id}
                type="button"
                onClick={() => openContact(contact)}
                className="rounded-xl border border-gray-200 bg-white p-5 text-left hover:border-slate-300 hover:shadow-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <UserRound size={20} />
                  </div>
                  <div className="flex gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${typeClasses(
                        contact.contactType
                      )}`}
                    >
                      {contact.contactType}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${activityClasses(
                        contact.activityStatus
                      )}`}
                    >
                      {contact.activityStatus}
                    </span>
                  </div>
                </div>
                <p className="mt-4 font-bold text-gray-900">
                  {contact.name}
                </p>
                <div className="mt-3 space-y-2 text-sm text-gray-500">
                  <p className="flex items-center gap-2 truncate">
                    <Phone size={14} /> {contact.phone || "No phone"}
                  </p>
                  <p className="flex items-center gap-2 truncate">
                    <Mail size={14} /> {contact.email || "No email"}
                  </p>
                  <p className="flex items-center gap-2 line-clamp-2">
                    <MapPin size={14} className="shrink-0" />
                    {address || "No address"}
                  </p>
                </div>
                <p className="mt-4 text-xs font-semibold text-slate-500">
                  {propertyCount}{" "}
                  {propertyCount === 1 ? "property" : "properties"}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="app-modal-overlay fixed inset-0 z-[80] flex items-stretch justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-4 sm:px-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {selected ? selected.name : "Add Contact"}
                </h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  Only the contact name is required. Add any number of properties, photos, and linked records before saving.
                </p>
              </div>
              <button
                type="button"
                onClick={closeContactModal}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="shrink-0 border-b border-gray-100 px-4 sm:px-6">
              <div className="flex gap-1 overflow-x-auto">
                {tabs.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setActiveTab(value)}
                    className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold ${
                      activeTab === value
                        ? "border-slate-700 text-slate-900 dark:border-slate-200 dark:text-white"
                        : "border-transparent text-gray-500"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
              {modalError && (
                <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {modalError}
                </div>
              )}

              {activeTab === "details" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Name *</label>
                    <input
                      value={draft.name}
                      onChange={(event) =>
                        setContactField("name", event.target.value)
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Email</label>
                    <input
                      type="email"
                      name="yardpilot-contact-email"
                      autoComplete="email"
                      value={draft.email}
                      onChange={(event) =>
                        setContactField("email", event.target.value)
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Phone</label>
                    <input
                      type="tel"
                      value={draft.phone}
                      onChange={(event) =>
                        setContactField("phone", event.target.value)
                      }
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Street Address</label>
                    <input
                      value={draft.address}
                      onChange={(event) =>
                        setContactField("address", event.target.value)
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>City</label>
                    <input
                      value={draft.city}
                      onChange={(event) =>
                        setContactField("city", event.target.value)
                      }
                      className={inputClass}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>State</label>
                      <input
                        value={draft.state}
                        onChange={(event) =>
                          setContactField("state", event.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>ZIP</label>
                      <input
                        value={draft.zip}
                        onChange={(event) =>
                          setContactField("zip", event.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Contact Type</label>
                    <select
                      value={draft.contactType}
                      onChange={(event) =>
                        setContactField(
                          "contactType",
                          event.target.value as ContactType
                        )
                      }
                      className={inputClass}
                    >
                      {CONTACT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Activity</label>
                    <select
                      value={draft.activityStatus}
                      onChange={(event) =>
                        setContactField(
                          "activityStatus",
                          event.target.value as ContactActivity
                        )
                      }
                      className={inputClass}
                    >
                      {ACTIVITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Source</label>
                    <select
                      value={draft.source}
                      onChange={(event) =>
                        setContactField("source", event.target.value)
                      }
                      className={inputClass}
                    >
                      {SOURCE_OPTIONS.map((option) => (
                        <option key={option || "blank"} value={option}>
                          {option || "Not specified"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Notes</label>
                    <textarea
                      rows={5}
                      value={draft.notes}
                      onChange={(event) =>
                        setContactField("notes", event.target.value)
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
              )}

              {activeTab === "properties" &&
                (selected ? (
                  <div>
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-gray-900">
                          Linked properties
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                          A contact may have any number of service locations.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={openNewProperty}
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white"
                      >
                        <Plus size={15} /> Add Property
                      </button>
                    </div>
                    {selectedProperties.length === 0 ? (
                      <button
                        type="button"
                        onClick={openNewProperty}
                        className="w-full rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-500 hover:border-slate-400"
                      >
                        <Building2
                          size={28}
                          className="mx-auto text-gray-300"
                        />
                        <p className="mt-3 font-semibold">
                          No properties yet
                        </p>
                        <p className="mt-1 text-sm">
                          Add one without leaving this contact.
                        </p>
                      </button>
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {selectedProperties.map((property) => {
                          const photos = propertyPhotos.filter(
                            (photo) => photo.propertyId === property.id
                          );
                          const history = projects.filter(
                            (project) => project.propertyId === property.id
                          );
                          return (
                            <button
                              key={property.id}
                              type="button"
                              onClick={() => openProperty(property)}
                              className="rounded-xl border border-gray-200 bg-white p-5 text-left hover:border-slate-300 hover:shadow-sm"
                            >
                              <div className="flex gap-4">
                                {photos[0]?.url ? (
                                  <img
                                    src={photos[0].url}
                                    alt={property.name}
                                    className="h-16 w-16 rounded-lg border border-gray-200 object-cover"
                                  />
                                ) : (
                                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                                    <Building2 size={22} />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold text-gray-900">
                                    {property.name}
                                  </p>
                                  <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                                    {propertyAddress(property) ||
                                      "No address"}
                                  </p>
                                  <p className="mt-2 text-xs text-gray-400">
                                    {photos.length} photos · {history.length}{" "}
                                    records
                                  </p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      Build the contact and every needed property in one pass. Nothing here is locked; empty property cards are ignored when you save.
                    </div>
                    {stagedProperties.map(propertyEditor)}
                    <button
                      type="button"
                      onClick={() =>
                        setStagedProperties((current) => [
                          ...current,
                          emptyStagedProperty(),
                        ])
                      }
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-4 text-sm font-semibold text-gray-600 hover:border-slate-400"
                    >
                      <Plus size={16} /> Add Another Property
                    </button>
                  </div>
                ))}

              {activeTab === "history" && selected && (
                <div className="space-y-5">
                  <div>
                    <h3 className="font-bold text-gray-900">
                      Contact history
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Estimates and jobs linked through any of this contact’s properties appear here.
                    </p>
                  </div>
                  {selectedContactProjects.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
                      No estimates or jobs are linked to this contact yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {selectedContactProjects.map((project) => (
                        <Link
                          key={project.id}
                          to={`/app/estimates/${project.id}`}
                          className="flex items-center gap-3 rounded-xl border border-gray-200 p-4 hover:border-slate-300"
                        >
                          <FileText
                            size={18}
                            className="shrink-0 text-slate-600"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-gray-900">
                              {project.name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {project.estimateNumber} ·{" "}
                              {project.estimateStatus}
                            </p>
                          </div>
                          <p className="text-sm font-bold text-gray-900">
                            {formatMoney(project.totalEstimate)}
                          </p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-gray-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
              <div>
                {selected && (
                  <button
                    type="button"
                    onClick={() => void removeContact()}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-red-600"
                  >
                    <Trash2 size={15} /> Delete Contact
                  </button>
                )}
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={closeContactModal}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 sm:flex-none"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveContact()}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:flex-none"
                >
                  {saving
                    ? "Saving…"
                    : selected
                      ? "Update & Close"
                      : "Create & Close"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {propertyModalOpen && selected && (
        <div className="app-modal-overlay fixed inset-0 z-[90] flex items-stretch justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-4xl sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {selectedProperty
                    ? selectedProperty.name
                    : "Add Property"}
                </h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  Save details, photos, and linked history together.
                </p>
              </div>
              <button
                type="button"
                onClick={closePropertyModal}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
              {propertyError && (
                <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {propertyError}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Property Name / Label</label>
                  <input
                    value={propertyDraft.name}
                    onChange={(event) =>
                      setPropertyDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Street Address</label>
                  <input
                    value={propertyDraft.address}
                    onChange={(event) =>
                      setPropertyDraft((current) => ({
                        ...current,
                        address: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>City</label>
                  <input
                    value={propertyDraft.city}
                    onChange={(event) =>
                      setPropertyDraft((current) => ({
                        ...current,
                        city: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>State</label>
                    <input
                      value={propertyDraft.state}
                      onChange={(event) =>
                        setPropertyDraft((current) => ({
                          ...current,
                          state: event.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>ZIP</label>
                    <input
                      value={propertyDraft.zip}
                      onChange={(event) =>
                        setPropertyDraft((current) => ({
                          ...current,
                          zip: event.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Description</label>
                  <textarea
                    rows={3}
                    value={propertyDraft.description}
                    onChange={(event) =>
                      setPropertyDraft((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Client-visible Notes</label>
                  <textarea
                    rows={4}
                    value={propertyDraft.clientNotes}
                    onChange={(event) =>
                      setPropertyDraft((current) => ({
                        ...current,
                        clientNotes: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Internal Notes</label>
                  <textarea
                    rows={4}
                    value={propertyDraft.internalNotes}
                    onChange={(event) =>
                      setPropertyDraft((current) => ({
                        ...current,
                        internalNotes: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
              </div>

              <section className="mt-7 border-t border-gray-100 pt-6">
                <div className="mb-3 flex items-center gap-2">
                  <ImageIcon size={18} className="text-slate-600" />
                  <h3 className="font-bold text-gray-900">
                    Property Photos
                  </h3>
                </div>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-7 text-sm font-semibold text-gray-600 hover:border-slate-400">
                  <Upload size={17} /> Choose Photos
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      const files = Array.from(
                        event.currentTarget.files ?? []
                      ) as File[];
                      setPropertyFiles((current) => [
                        ...current,
                        ...files,
                      ]);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <StagedPhotos
                  files={propertyFiles}
                  onRemove={(index) =>
                    setPropertyFiles((current) =>
                      current.filter(
                        (_, itemIndex) => itemIndex !== index
                      )
                    )
                  }
                />
                <PhotoGrid
                  photos={selectedPropertyPhotos}
                  onDelete={(photo) => void removePhoto(photo)}
                />
              </section>

              <section className="mt-7 border-t border-gray-100 pt-6">
                <div className="mb-3 flex items-center gap-2">
                  <Link2 size={18} className="text-slate-600" />
                  <h3 className="font-bold text-gray-900">
                    Linked Estimates and Jobs
                  </h3>
                </div>
                <RecordPicker
                  projects={linkableProjects}
                  selectedIds={propertyProjectIds}
                  onToggle={(id) =>
                    toggleArrayId(id, setPropertyProjectIds)
                  }
                />
              </section>
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-gray-100 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
              <div>
                {selectedProperty && (
                  <button
                    type="button"
                    onClick={() => void removeProperty()}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-red-600"
                  >
                    <Trash2 size={15} /> Delete Property
                  </button>
                )}
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={closePropertyModal}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 sm:flex-none"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveProperty()}
                  disabled={propertySaving}
                  className="flex-1 rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:flex-none"
                >
                  {propertySaving
                    ? "Saving…"
                    : selectedProperty
                      ? "Update & Close"
                      : "Create & Close"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

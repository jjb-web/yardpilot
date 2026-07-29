import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
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
} from "../data/types";
import { formatMoney, propertyAddress } from "../lib/estimate";

const CONTACT_TYPE_OPTIONS: Array<{ value: ContactType; label: string }> = [
  { value: "lead", label: "Lead" },
  { value: "customer", label: "Customer" },
];

const ACTIVITY_OPTIONS: Array<{ value: ContactActivity; label: string }> = [
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

function hasPropertyData(draft: PropertyDraft, files: File[], projectIds: string[]) {
  return (
    Object.values(draft).some((value) => value.trim() !== "") ||
    files.length > 0 ||
    projectIds.length > 0
  );
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
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
      {files.map((file, index) => (
        <div key={`${file.name}-${file.lastModified}-${index}`} className="relative group">
          <img
            src={urls[index]}
            alt={file.name}
            className="w-full aspect-square object-cover rounded-lg border border-gray-200"
          />
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="absolute top-2 right-2 rounded-md bg-black/70 p-1.5 text-white cursor-pointer"
            aria-label={`Remove ${file.name}`}
          >
            <X size={14} />
          </button>
          <p className="mt-1 truncate text-[11px] text-gray-500">{file.name}</p>
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
    <div className="max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-gray-200 divide-y divide-gray-100">
      {projects.map((project) => {
        const checked = selectedIds.includes(project.id);
        return (
          <button
            key={project.id}
            type="button"
            onClick={() => onToggle(project.id)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 cursor-pointer"
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
                {project.estimateNumber} · {project.status} · {formatMoney(project.totalEstimate)}
              </p>
            </div>
          </button>
        );
      })}
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
    useState<"details" | "property" | "history">("details");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [draft, setDraft] = useState<ContactDraft>(emptyContact);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  const [newPropertyDraft, setNewPropertyDraft] =
    useState<PropertyDraft>(emptyProperty);
  const [newPropertyFiles, setNewPropertyFiles] = useState<File[]>([]);
  const [newLinkedProjectIds, setNewLinkedProjectIds] = useState<string[]>([]);

  const [propertyModalOpen, setPropertyModalOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [propertyDraft, setPropertyDraft] =
    useState<PropertyDraft>(emptyProperty);
  const [propertyFiles, setPropertyFiles] = useState<File[]>([]);
  const [propertyLinkedProjectIds, setPropertyLinkedProjectIds] =
    useState<string[]>([]);
  const [propertySaving, setPropertySaving] = useState(false);
  const [propertyError, setPropertyError] = useState("");

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...contacts]
      .filter((contact) => {
        if (typeFilter !== "all" && contact.contactType !== typeFilter) {
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
      .sort((a, b) => {
        if (a.activityStatus !== b.activityStatus) {
          return a.activityStatus === "active" ? -1 : 1;
        }
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [contacts, search, typeFilter, activityFilter]);

  const selectedProperties = properties.filter(
    (property) => property.contactId === selected?.id
  );
  const selectedPropertyPhotos = propertyPhotos.filter(
    (photo) => photo.propertyId === selectedProperty?.id
  );
  const selectedPropertyProjects = projects
    .filter((project) => project.propertyId === selectedProperty?.id)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  const selectedContactProjects = projects
    .filter((project) => project.contactId === selected?.id)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

  const linkableForNew = projects.filter(
    (project) => !project.contactId || project.contactId === selected?.id
  );

  const inputClass =
    "w-full min-h-11 px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/25";
  const labelClass =
    "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

  function setContactField<K extends keyof ContactDraft>(
    key: K,
    value: ContactDraft[K]
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setNewPropertyField<K extends keyof PropertyDraft>(
    key: K,
    value: PropertyDraft[K]
  ) {
    setNewPropertyDraft((current) => ({ ...current, [key]: value }));
  }

  function setPropertyField<K extends keyof PropertyDraft>(
    key: K,
    value: PropertyDraft[K]
  ) {
    setPropertyDraft((current) => ({ ...current, [key]: value }));
  }

  function toggleId(id: string, setter: Dispatch<SetStateAction<string[]>>) {
    setter((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );
  }

  function resetContactModal() {
    setSelected(null);
    setDraft(emptyContact());
    setNewPropertyDraft(emptyProperty());
    setNewPropertyFiles([]);
    setNewLinkedProjectIds([]);
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
    setNewPropertyDraft(emptyProperty());
    setNewPropertyFiles([]);
    setNewLinkedProjectIds([]);
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
        address:
          property?.address || contact.address || project.address,
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

      let createdProperty: Property | null = null;
      if (
        !selected &&
        hasPropertyData(
          newPropertyDraft,
          newPropertyFiles,
          newLinkedProjectIds
        )
      ) {
        createdProperty = await addProperty({
          id: uid(),
          workspaceId: activeWorkspaceId,
          contactId: savedContact.id,
          ...newPropertyDraft,
          name: newPropertyDraft.name.trim() || "Primary Property",
          address: newPropertyDraft.address.trim(),
          city: newPropertyDraft.city.trim(),
          state: newPropertyDraft.state.trim(),
          zip: newPropertyDraft.zip.trim(),
          description: newPropertyDraft.description.trim(),
          internalNotes: newPropertyDraft.internalNotes.trim(),
          clientNotes: newPropertyDraft.clientNotes.trim(),
          createdAt: now,
          updatedAt: now,
        });
        await uploadFiles(createdProperty.id, newPropertyFiles);
      }

      if (!selected && newLinkedProjectIds.length) {
        await linkProjects(newLinkedProjectIds, savedContact, createdProperty);
      }

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
    if (!window.confirm(`Delete ${selected.name} and their linked properties?`)) {
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

  function resetPropertyModal() {
    setSelectedProperty(null);
    setPropertyDraft(emptyProperty());
    setPropertyFiles([]);
    setPropertyLinkedProjectIds([]);
    setPropertyError("");
  }

  function openNewProperty() {
    if (!selected) return;
    resetPropertyModal();
    setPropertyDraft({
      ...emptyProperty(),
      name: selectedProperties.length === 0 ? "Primary Property" : "",
    });
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
    setPropertyLinkedProjectIds(
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
    resetPropertyModal();
  }

  async function saveProperty() {
    if (!selected || !activeWorkspaceId) return;
    setPropertyError("");
    setPropertySaving(true);
    const now = new Date().toISOString();
    try {
      const savedProperty = selectedProperty
        ? await updateProperty({
            ...selectedProperty,
            ...propertyDraft,
            name: propertyDraft.name.trim() || "Primary Property",
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
            name: propertyDraft.name.trim() || "Primary Property",
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
        const removedLinks = projects.filter(
          (project) =>
            project.propertyId === selectedProperty.id &&
            !propertyLinkedProjectIds.includes(project.id)
        );
        for (const project of removedLinks) {
          await updateProject({
            ...project,
            contactId: selected.id,
            propertyId: null,
            updatedAt: now,
          });
        }
      }

      await linkProjects(propertyLinkedProjectIds, selected, savedProperty);

      setPropertyModalOpen(false);
      resetPropertyModal();
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
    if (!window.confirm(`Delete ${selectedProperty.name} and its photos?`)) {
      return;
    }
    setPropertySaving(true);
    try {
      await deleteProperty(selectedProperty.id);
      setPropertyModalOpen(false);
      resetPropertyModal();
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

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts & Properties</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create a contact, property, photos, and linked history in one workflow.
          </p>
        </div>
        <button
          type="button"
          onClick={openNewContact}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 cursor-pointer"
        >
          <Plus size={16} /> Add Contact
        </button>
      </div>

      {(contactsError || propertiesError) && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {contactsError || propertiesError}
        </div>
      )}

      <div className="mb-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="relative">
          <Search
            size={17}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, email, phone, or address"
            className={`${inputClass} pl-10`}
          />
        </div>
        <select
          value={typeFilter}
          onChange={(event) =>
            setTypeFilter(event.target.value as "all" | ContactType)
          }
          className={inputClass}
        >
          <option value="all">All types</option>
          <option value="lead">Leads</option>
          <option value="customer">Customers</option>
        </select>
        <select
          value={activityFilter}
          onChange={(event) =>
            setActivityFilter(event.target.value as "all" | ContactActivity)
          }
          className={inputClass}
        >
          <option value="all">Active & inactive</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {contactsLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-16 text-center text-sm text-gray-400">
          Loading contacts…
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-16 text-center">
          <UserRound size={30} className="mx-auto text-gray-300" />
          <p className="mt-3 font-semibold text-gray-700">No contacts found</p>
          <p className="mt-1 text-sm text-gray-400">
            Add a lead or customer to begin.
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
                className="rounded-xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md cursor-pointer"
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                    <UserRound size={20} />
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
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
                <p className="font-bold text-gray-900">{contact.name}</p>
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
                  {propertyCount} {propertyCount === 1 ? "property" : "properties"}
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
                  Contact details, properties, photos, and history are all optional except the name.
                </p>
              </div>
              <button
                type="button"
                onClick={closeContactModal}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="shrink-0 border-b border-gray-100 px-4 sm:px-6">
              <div className="flex gap-1 overflow-x-auto">
                {([
                  ["details", "Contact Details"],
                  ["property", selected ? "Properties" : "First Property"],
                  ["history", "Photos & History"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setActiveTab(value)}
                    className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold cursor-pointer ${
                      activeTab === value
                        ? "border-slate-800 text-slate-900"
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
                      onChange={(event) => setContactField("name", event.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Email</label>
                    <input
                      type="email"
                      value={draft.email}
                      onChange={(event) => setContactField("email", event.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Phone</label>
                    <input
                      type="tel"
                      value={draft.phone}
                      onChange={(event) => setContactField("phone", event.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Contact Street Address</label>
                    <input
                      value={draft.address}
                      onChange={(event) => setContactField("address", event.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>City</label>
                    <input
                      value={draft.city}
                      onChange={(event) => setContactField("city", event.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>State</label>
                      <input
                        value={draft.state}
                        onChange={(event) => setContactField("state", event.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>ZIP</label>
                      <input
                        value={draft.zip}
                        onChange={(event) => setContactField("zip", event.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Type</label>
                    <select
                      value={draft.contactType}
                      onChange={(event) =>
                        setContactField("contactType", event.target.value as ContactType)
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
                      onChange={(event) => setContactField("source", event.target.value)}
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
                      onChange={(event) => setContactField("notes", event.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
              )}

              {activeTab === "property" && (
                selected ? (
                  <div>
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-gray-900">Linked properties</h3>
                        <p className="mt-1 text-sm text-gray-500">
                          Add and edit as many service locations as this contact needs.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={openNewProperty}
                        className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white cursor-pointer"
                      >
                        <Plus size={15} /> Add Property
                      </button>
                    </div>
                    {selectedProperties.length === 0 ? (
                      <button
                        type="button"
                        onClick={openNewProperty}
                        className="w-full rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-500 hover:border-slate-400 cursor-pointer"
                      >
                        <Building2 size={28} className="mx-auto text-gray-300" />
                        <p className="mt-3 font-semibold">No properties yet</p>
                        <p className="mt-1 text-sm">Add one without leaving this contact.</p>
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
                              className="rounded-xl border border-gray-200 bg-white p-5 text-left hover:border-slate-300 hover:shadow-sm cursor-pointer"
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
                                  <p className="font-bold text-gray-900">{property.name}</p>
                                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                                    {propertyAddress(property) || "No address"}
                                  </p>
                                  <p className="mt-2 text-xs text-gray-400">
                                    {photos.length} photos · {history.length} records
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
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      Add an optional first property now. YardPilot will create it at the same time as the contact.
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Property Name / Label</label>
                      <input
                        value={newPropertyDraft.name}
                        onChange={(event) =>
                          setNewPropertyField("name", event.target.value)
                        }
                        placeholder="Primary Property, Rental, Commercial Site…"
                        className={inputClass}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Street Address</label>
                      <input
                        value={newPropertyDraft.address}
                        onChange={(event) =>
                          setNewPropertyField("address", event.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>City</label>
                      <input
                        value={newPropertyDraft.city}
                        onChange={(event) =>
                          setNewPropertyField("city", event.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>State</label>
                        <input
                          value={newPropertyDraft.state}
                          onChange={(event) =>
                            setNewPropertyField("state", event.target.value)
                          }
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>ZIP</label>
                        <input
                          value={newPropertyDraft.zip}
                          onChange={(event) =>
                            setNewPropertyField("zip", event.target.value)
                          }
                          className={inputClass}
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Property Description</label>
                      <textarea
                        rows={3}
                        value={newPropertyDraft.description}
                        onChange={(event) =>
                          setNewPropertyField("description", event.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Client-visible Notes</label>
                      <textarea
                        rows={4}
                        value={newPropertyDraft.clientNotes}
                        onChange={(event) =>
                          setNewPropertyField("clientNotes", event.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Internal Notes</label>
                      <textarea
                        rows={4}
                        value={newPropertyDraft.internalNotes}
                        onChange={(event) =>
                          setNewPropertyField("internalNotes", event.target.value)
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>
                )
              )}

              {activeTab === "history" && (
                selected ? (
                  <div className="space-y-6">
                    <div>
                      <h3 className="font-bold text-gray-900">Contact history</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        Open a property to upload photos or change which estimate/job is linked to it.
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
                            <FileText size={18} className="shrink-0 text-slate-600" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-gray-900">
                                {project.name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {project.estimateNumber} · {project.status}
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
                ) : (
                  <div className="space-y-7">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      Add photos and choose existing records now. When you save, YardPilot creates the contact and optional property, uploads the photos, and links the selected records in one step.
                    </div>
                    <section>
                      <div className="mb-3 flex items-center gap-2">
                        <ImageIcon size={18} className="text-slate-600" />
                        <h3 className="font-bold text-gray-900">Property Photos</h3>
                      </div>
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-7 text-sm font-semibold text-gray-600 hover:border-slate-400">
                        <Upload size={17} /> Choose Photos
                        <input
                          type="file"
                          accept="image/*,.heic,.heif"
                          multiple
                          className="sr-only"
                          onChange={(event) => {
                            const files: File[] = Array.from(event.currentTarget.files ?? []);
                            setNewPropertyFiles((current) => [...current, ...files]);
                            event.currentTarget.value = "";
                          }}
                        />
                      </label>
                      <StagedPhotos
                        files={newPropertyFiles}
                        onRemove={(index) =>
                          setNewPropertyFiles((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index)
                          )
                        }
                      />
                    </section>
                    <section>
                      <div className="mb-3 flex items-center gap-2">
                        <Link2 size={18} className="text-slate-600" />
                        <h3 className="font-bold text-gray-900">
                          Link Existing Estimates or Jobs
                        </h3>
                      </div>
                      <RecordPicker
                        projects={linkableForNew}
                        selectedIds={newLinkedProjectIds}
                        onToggle={(id) => toggleId(id, setNewLinkedProjectIds)}
                      />
                    </section>
                  </div>
                )
              )}
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-gray-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
              <div>
                {selected && (
                  <button
                    type="button"
                    onClick={() => void removeContact()}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-red-600 cursor-pointer"
                  >
                    <Trash2 size={15} /> Delete Contact
                  </button>
                )}
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={closeContactModal}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 sm:flex-none cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveContact()}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:flex-none cursor-pointer"
                >
                  {saving ? "Saving…" : selected ? "Update & Close" : "Create & Close"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {propertyModalOpen && selected && (
        <div className="app-modal-overlay fixed inset-0 z-[90] flex items-stretch justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-4 sm:px-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {selectedProperty ? selectedProperty.name : "Add Property"}
                </h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  Linked to {selected.name}. Details, photos, and history can be saved together.
                </p>
              </div>
              <button
                type="button"
                onClick={closePropertyModal}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 space-y-7">
              {propertyError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {propertyError}
                </div>
              )}

              <section className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Property Name / Label</label>
                  <input
                    value={propertyDraft.name}
                    onChange={(event) =>
                      setPropertyField("name", event.target.value)
                    }
                    placeholder="Primary Property, Rental, Commercial Site…"
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Street Address</label>
                  <input
                    value={propertyDraft.address}
                    onChange={(event) =>
                      setPropertyField("address", event.target.value)
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>City</label>
                  <input
                    value={propertyDraft.city}
                    onChange={(event) =>
                      setPropertyField("city", event.target.value)
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
                        setPropertyField("state", event.target.value)
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>ZIP</label>
                    <input
                      value={propertyDraft.zip}
                      onChange={(event) =>
                        setPropertyField("zip", event.target.value)
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Property Description</label>
                  <textarea
                    rows={3}
                    value={propertyDraft.description}
                    onChange={(event) =>
                      setPropertyField("description", event.target.value)
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
                      setPropertyField("clientNotes", event.target.value)
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
                      setPropertyField("internalNotes", event.target.value)
                    }
                    className={inputClass}
                  />
                </div>
              </section>

              <section className="border-t border-gray-100 pt-6">
                <div className="mb-4 flex items-center gap-2">
                  <ImageIcon size={18} className="text-slate-600" />
                  <div>
                    <h3 className="font-bold text-gray-900">Property Photos</h3>
                    <p className="text-sm text-gray-500">
                      Choose photos now. New files upload when you press Save & Close.
                    </p>
                  </div>
                </div>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm font-semibold text-gray-600 hover:border-slate-400">
                  <Upload size={17} /> Choose Photos
                  <input
                    type="file"
                    accept="image/*,.heic,.heif"
                    multiple
                    className="sr-only"
                    onChange={(event) => {
                      const files: File[] = Array.from(event.currentTarget.files ?? []);
                      setPropertyFiles((current) => [...current, ...files]);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                <StagedPhotos
                  files={propertyFiles}
                  onRemove={(index) =>
                    setPropertyFiles((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index)
                    )
                  }
                />
                {selectedPropertyPhotos.length > 0 && (
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {selectedPropertyPhotos.map((photo) => (
                      <div key={photo.id} className="relative group">
                        <img
                          src={photo.url}
                          alt={photo.caption || "Property"}
                          className="w-full aspect-square rounded-lg border border-gray-200 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => void deletePropertyPhoto(photo)}
                          className="absolute right-2 top-2 rounded-md bg-black/70 p-1.5 text-white cursor-pointer"
                          aria-label="Delete photo"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="border-t border-gray-100 pt-6">
                <div className="mb-3 flex items-center gap-2">
                  <Link2 size={18} className="text-slate-600" />
                  <div>
                    <h3 className="font-bold text-gray-900">
                      Linked Estimates & Jobs
                    </h3>
                    <p className="text-sm text-gray-500">
                      Select records to attach to this property when it is saved.
                    </p>
                  </div>
                </div>
                <RecordPicker
                  projects={projects.filter(
                    (project) =>
                      !project.contactId ||
                      project.contactId === selected.id ||
                      project.propertyId === selectedProperty?.id
                  )}
                  selectedIds={propertyLinkedProjectIds}
                  onToggle={(id) => toggleId(id, setPropertyLinkedProjectIds)}
                />

                {selectedPropertyProjects.length > 0 && (
                  <div className="mt-5 space-y-2">
                    {selectedPropertyProjects.map((project) => (
                      <Link
                        key={project.id}
                        to={`/app/estimates/${project.id}`}
                        className="flex items-center gap-3 rounded-lg border border-gray-200 p-3 hover:border-slate-300"
                      >
                        <FileText size={17} className="shrink-0 text-slate-600" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {project.name}
                          </p>
                          <p className="text-xs text-gray-400">
                            {project.estimateNumber} · {project.status}
                          </p>
                        </div>
                        <p className="text-sm font-bold text-gray-900">
                          {formatMoney(project.totalEstimate)}
                        </p>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-gray-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
              <div>
                {selectedProperty && (
                  <button
                    type="button"
                    onClick={() => void removeProperty()}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-red-600 cursor-pointer"
                  >
                    <Trash2 size={15} /> Delete Property
                  </button>
                )}
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={closePropertyModal}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 sm:flex-none cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveProperty()}
                  disabled={propertySaving}
                  className="flex-1 rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:flex-none cursor-pointer"
                >
                  {propertySaving ? "Saving…" : "Save & Close"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

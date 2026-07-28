import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Building2,
  FileText,
  ImagePlus,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type {
  Contact,
  ContactActivity,
  ContactType,
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

type ContactDraft = Omit<Contact, "id" | "createdAt" | "updatedAt">;
type PropertyDraft = Omit<Property, "id" | "contactId" | "createdAt" | "updatedAt">;

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 11);
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
  const cityStateZip = [contact.city, contact.state, contact.zip].filter(Boolean).join(" ");
  return [contact.address, cityStateZip].filter(Boolean).join(", ");
}

function typeClasses(type: ContactType) {
  return type === "customer" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700";
}

function activityClasses(status: ContactActivity) {
  return status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600";
}

export default function Contacts() {
  const {
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
  } = useApp();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ContactType>("all");
  const [activityFilter, setActivityFilter] = useState<"all" | ContactActivity>("all");

  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "properties">("details");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [draft, setDraft] = useState<ContactDraft>(emptyContact);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  const [propertyModalOpen, setPropertyModalOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [propertyDraft, setPropertyDraft] = useState<PropertyDraft>(emptyProperty);
  const [propertySaving, setPropertySaving] = useState(false);
  const [propertyError, setPropertyError] = useState("");
  const [uploading, setUploading] = useState(false);

  const filteredContacts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...contacts]
      .filter((contact) => {
        if (typeFilter !== "all" && contact.contactType !== typeFilter) return false;
        if (activityFilter !== "all" && contact.activityStatus !== activityFilter) return false;
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
        if (a.activityStatus !== b.activityStatus) return a.activityStatus === "active" ? -1 : 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [contacts, search, typeFilter, activityFilter]);

  const selectedProperties = properties.filter((property) => property.contactId === selected?.id);
  const selectedPropertyPhotos = propertyPhotos.filter(
    (photo) => photo.propertyId === selectedProperty?.id
  );
  const selectedPropertyProjects = projects
    .filter((project) => project.propertyId === selectedProperty?.id)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  function setContactField<K extends keyof ContactDraft>(key: K, value: ContactDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setPropertyField<K extends keyof PropertyDraft>(key: K, value: PropertyDraft[K]) {
    setPropertyDraft((current) => ({ ...current, [key]: value }));
  }

  function openNewContact() {
    setSelected(null);
    setDraft(emptyContact());
    setActiveTab("details");
    setModalError("");
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
    setActiveTab("details");
    setModalError("");
    setModalOpen(true);
  }

  function closeContactModal() {
    if (saving || propertySaving || uploading) return;
    setModalOpen(false);
    setSelected(null);
    setDraft(emptyContact());
    setModalError("");
  }

  async function saveContact() {
    setModalError("");
    if (!draft.name.trim()) {
      setModalError("Enter a contact name before saving.");
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    try {
      if (selected) {
        const saved = await updateContact({
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
        });
        setSelected(saved);
      } else {
        const saved = await addContact({
          id: uid(),
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
        setSelected(saved);
        setDraft({ ...draft, name: saved.name });
        setActiveTab("properties");
      }
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "The contact could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function removeContact() {
    if (!selected) return;
    if (!window.confirm(`Delete ${selected.name} and their linked properties?`)) return;
    setSaving(true);
    try {
      await deleteContact(selected.id);
      closeContactModal();
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "The contact could not be deleted.");
    } finally {
      setSaving(false);
    }
  }

  function openNewProperty() {
    if (!selected) return;
    setSelectedProperty(null);
    setPropertyDraft({
      ...emptyProperty(),
      name: selectedProperties.length === 0 ? "Primary Property" : "",
      address: selected.address,
      city: selected.city,
      state: selected.state,
      zip: selected.zip,
    });
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
    setPropertyError("");
    setPropertyModalOpen(true);
  }

  function closePropertyModal() {
    if (propertySaving || uploading) return;
    setPropertyModalOpen(false);
    setSelectedProperty(null);
    setPropertyDraft(emptyProperty());
    setPropertyError("");
  }

  async function saveProperty() {
    if (!selected) return;
    setPropertyError("");
    if (!propertyDraft.name.trim()) {
      setPropertyError("Enter a property name or label.");
      return;
    }

    setPropertySaving(true);
    const now = new Date().toISOString();
    try {
      if (selectedProperty) {
        const saved = await updateProperty({
          ...selectedProperty,
          ...propertyDraft,
          name: propertyDraft.name.trim(),
          updatedAt: now,
        });
        setSelectedProperty(saved);
      } else {
        const saved = await addProperty({
          id: uid(),
          contactId: selected.id,
          ...propertyDraft,
          name: propertyDraft.name.trim(),
          createdAt: now,
          updatedAt: now,
        });
        setSelectedProperty(saved);
      }
    } catch (error) {
      setPropertyError(error instanceof Error ? error.message : "The property could not be saved.");
    } finally {
      setPropertySaving(false);
    }
  }

  async function removeProperty() {
    if (!selectedProperty) return;
    if (!window.confirm(`Delete ${selectedProperty.name} and its photos?`)) return;
    setPropertySaving(true);
    try {
      await deleteProperty(selectedProperty.id);
      closePropertyModal();
    } catch (error) {
      setPropertyError(error instanceof Error ? error.message : "The property could not be deleted.");
    } finally {
      setPropertySaving(false);
    }
  }

  async function uploadPhotos(files: FileList | null) {
    if (!selectedProperty || !files?.length) return;
    setUploading(true);
    setPropertyError("");
    try {
      for (const file of Array.from(files)) {
        await uploadPropertyPhoto(selectedProperty.id, file);
      }
    } catch (error) {
      setPropertyError(error instanceof Error ? error.message : "A photo could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30";
  const labelClass = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Contacts</h1>
          <p className="text-gray-500 text-sm mt-1">Customers, leads, properties, photos, and prior work.</p>
        </div>
        <button type="button" onClick={openNewContact} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 cursor-pointer">
          <Plus size={16} /> Add Contact
        </button>
      </div>

      <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative w-full max-w-md">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search contacts..." className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
            {([ ["all", "All"], ["lead", "Leads"], ["customer", "Customers"] ] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setTypeFilter(value)} className={`rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer ${typeFilter === value ? "bg-green-700 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
            {([ ["all", "All"], ["active", "Active"], ["inactive", "Inactive"] ] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setActivityFilter(value)} className={`rounded-md px-3 py-1.5 text-xs font-semibold cursor-pointer ${activityFilter === value ? "bg-green-700 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(contactsError || propertiesError) && (
        <div className="mb-5 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          {contactsError || propertiesError}
        </div>
      )}

      {contactsLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center text-gray-400 text-sm">Loading contacts...</div>
      ) : filteredContacts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <UserRound size={34} className="text-gray-300 mx-auto mb-3" />
          <p className="font-semibold text-gray-700">No contacts found</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredContacts.map((contact) => {
            const propertyCount = properties.filter((property) => property.contactId === contact.id).length;
            return (
              <button type="button" key={contact.id} onClick={() => openContact(contact)} className="text-left bg-white border border-gray-200 rounded-xl p-5 hover:border-green-300 hover:shadow-sm transition-all cursor-pointer">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 truncate">{contact.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{contact.source || "No source"}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${typeClasses(contact.contactType)}`}>{contact.contactType}</span>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${activityClasses(contact.activityStatus)}`}>{contact.activityStatus}</span>
                  </div>
                </div>
                <div className="space-y-2.5 text-sm text-gray-600">
                  <div className="flex gap-2.5"><Phone size={15} className="text-green-700 shrink-0 mt-0.5" /><span className="truncate">{contact.phone || "No phone"}</span></div>
                  <div className="flex gap-2.5"><Mail size={15} className="text-green-700 shrink-0 mt-0.5" /><span className="truncate">{contact.email || "No email"}</span></div>
                  <div className="flex gap-2.5"><MapPin size={15} className="text-green-700 shrink-0 mt-0.5" /><span className="line-clamp-2">{contactAddress(contact) || "No address"}</span></div>
                  <div className="flex gap-2.5 pt-1"><Building2 size={15} className="text-green-700 shrink-0 mt-0.5" /><span>{propertyCount} {propertyCount === 1 ? "property" : "properties"}</span></div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[70] bg-black/55 flex items-center justify-center p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeContactModal(); }}>
          <div className="w-full max-w-5xl max-h-[92vh] overflow-hidden bg-white rounded-2xl shadow-2xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selected ? selected.name : "Add Contact"}</h2>
                <p className="text-sm text-gray-500 mt-0.5">Manage contact details and linked properties.</p>
              </div>
              <button type="button" onClick={closeContactModal} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 cursor-pointer"><X size={20} /></button>
            </div>

            <div className="px-6 pt-4 border-b border-gray-100 flex gap-2">
              <button type="button" onClick={() => setActiveTab("details")} className={`px-4 py-2.5 text-sm font-semibold border-b-2 cursor-pointer ${activeTab === "details" ? "border-green-700 text-green-700" : "border-transparent text-gray-500"}`}>Contact Details</button>
              <button type="button" disabled={!selected} onClick={() => setActiveTab("properties")} className={`px-4 py-2.5 text-sm font-semibold border-b-2 cursor-pointer disabled:opacity-40 ${activeTab === "properties" ? "border-green-700 text-green-700" : "border-transparent text-gray-500"}`}>Properties & History</button>
            </div>

            <div className="p-6 overflow-y-auto">
              {modalError && <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{modalError}</div>}

              {activeTab === "details" ? (
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2"><label className={labelClass}>Full Name</label><input value={draft.name} onChange={(event) => setContactField("name", event.target.value)} className={inputClass} /></div>
                  <div><label className={labelClass}>Email</label><input type="email" value={draft.email} onChange={(event) => setContactField("email", event.target.value)} className={inputClass} /></div>
                  <div><label className={labelClass}>Phone</label><input value={draft.phone} onChange={(event) => setContactField("phone", event.target.value)} className={inputClass} /></div>
                  <div className="sm:col-span-2"><label className={labelClass}>Default Street Address</label><input value={draft.address} onChange={(event) => setContactField("address", event.target.value)} className={inputClass} /></div>
                  <div><label className={labelClass}>City</label><input value={draft.city} onChange={(event) => setContactField("city", event.target.value)} className={inputClass} /></div>
                  <div className="grid grid-cols-2 gap-4"><div><label className={labelClass}>State</label><input value={draft.state} onChange={(event) => setContactField("state", event.target.value)} className={inputClass} /></div><div><label className={labelClass}>ZIP</label><input value={draft.zip} onChange={(event) => setContactField("zip", event.target.value)} className={inputClass} /></div></div>
                  <div><label className={labelClass}>Contact Type</label><select value={draft.contactType} onChange={(event) => setContactField("contactType", event.target.value as ContactType)} className={inputClass}>{CONTACT_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                  <div><label className={labelClass}>Activity</label><select value={draft.activityStatus} onChange={(event) => setContactField("activityStatus", event.target.value as ContactActivity)} className={inputClass}>{ACTIVITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
                  <div><label className={labelClass}>Source</label><select value={draft.source} onChange={(event) => setContactField("source", event.target.value)} className={inputClass}>{SOURCE_OPTIONS.map((source) => <option key={source || "blank"} value={source}>{source || "Blank"}</option>)}</select></div>
                  <div className="sm:col-span-2"><label className={labelClass}>Contact Notes</label><textarea value={draft.notes} onChange={(event) => setContactField("notes", event.target.value)} rows={4} className={inputClass} /></div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between gap-4 mb-5">
                    <div><h3 className="font-bold text-gray-900">Linked properties</h3><p className="text-sm text-gray-500 mt-1">Each property can contain descriptions, notes, photos, and estimate history.</p></div>
                    <button type="button" onClick={openNewProperty} className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-700 text-white text-sm font-semibold rounded-lg cursor-pointer"><Plus size={15} /> Add Property</button>
                  </div>
                  {selectedProperties.length === 0 ? (
                    <div className="border border-dashed border-gray-300 rounded-xl p-10 text-center text-sm text-gray-400">No properties yet.</div>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-4">
                      {selectedProperties.map((property) => {
                        const history = projects.filter((project) => project.propertyId === property.id);
                        const photos = propertyPhotos.filter((photo) => photo.propertyId === property.id);
                        return (
                          <button type="button" key={property.id} onClick={() => openProperty(property)} className="text-left border border-gray-200 rounded-xl p-5 hover:border-green-300 hover:shadow-sm cursor-pointer bg-white">
                            <div className="flex items-start gap-3">
                              {photos[0]?.url ? <img src={photos[0].url} alt="Property" className="w-16 h-16 rounded-lg object-cover border border-gray-200" /> : <div className="w-16 h-16 rounded-lg bg-green-50 text-green-700 flex items-center justify-center"><Building2 size={22} /></div>}
                              <div className="min-w-0"><p className="font-bold text-gray-900">{property.name}</p><p className="text-sm text-gray-500 mt-1 line-clamp-2">{propertyAddress(property) || "No address"}</p><p className="text-xs text-gray-400 mt-2">{photos.length} photos · {history.length} records</p></div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <div>{selected && <button type="button" onClick={() => void removeContact()} className="inline-flex items-center gap-2 text-red-600 text-sm font-semibold cursor-pointer"><Trash2 size={15} /> Delete</button>}</div>
              <div className="flex gap-2"><button type="button" onClick={closeContactModal} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 cursor-pointer">Cancel</button><button type="button" onClick={() => void saveContact()} disabled={saving} className="px-5 py-2.5 bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60 cursor-pointer">{saving ? "Saving..." : selected ? "Update Contact" : "Create Contact"}</button></div>
            </div>
          </div>
        </div>
      )}

      {propertyModalOpen && selected && (
        <div className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl max-h-[92vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center"><div><h2 className="text-xl font-bold text-gray-900">{selectedProperty ? selectedProperty.name : "Add Property"}</h2><p className="text-sm text-gray-500 mt-0.5">Linked to {selected.name}</p></div><button type="button" onClick={closePropertyModal} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg cursor-pointer"><X size={20} /></button></div>
            <div className="p-6 overflow-y-auto space-y-6">
              {propertyError && <div className="px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{propertyError}</div>}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><label className={labelClass}>Property Name / Label</label><input value={propertyDraft.name} onChange={(event) => setPropertyField("name", event.target.value)} placeholder="Primary Home, Rental, Commercial Site..." className={inputClass} /></div>
                <div className="sm:col-span-2"><label className={labelClass}>Street Address</label><input value={propertyDraft.address} onChange={(event) => setPropertyField("address", event.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>City</label><input value={propertyDraft.city} onChange={(event) => setPropertyField("city", event.target.value)} className={inputClass} /></div>
                <div className="grid grid-cols-2 gap-4"><div><label className={labelClass}>State</label><input value={propertyDraft.state} onChange={(event) => setPropertyField("state", event.target.value)} className={inputClass} /></div><div><label className={labelClass}>ZIP</label><input value={propertyDraft.zip} onChange={(event) => setPropertyField("zip", event.target.value)} className={inputClass} /></div></div>
                <div className="sm:col-span-2"><label className={labelClass}>Property Description (included in estimate)</label><textarea value={propertyDraft.description} onChange={(event) => setPropertyField("description", event.target.value)} rows={3} placeholder="Lot layout, access, existing landscape, project context..." className={inputClass} /></div>
                <div><label className={labelClass}>Client-visible Property Notes</label><textarea value={propertyDraft.clientNotes} onChange={(event) => setPropertyField("clientNotes", event.target.value)} rows={4} placeholder="Notes that may appear in shared estimates..." className={inputClass} /></div>
                <div><label className={labelClass}>Internal Property Notes</label><textarea value={propertyDraft.internalNotes} onChange={(event) => setPropertyField("internalNotes", event.target.value)} rows={4} placeholder="Gate codes, crew notes, supplier reminders..." className={inputClass} /></div>
              </div>

              <div className="border-t border-gray-100 pt-6">
                <div className="flex items-center justify-between gap-4 mb-4"><div><h3 className="font-bold text-gray-900">Property photos</h3><p className="text-sm text-gray-500 mt-1">These photos appear in the downloaded or shared estimate.</p></div>{selectedProperty && <label className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-50 text-green-700 rounded-lg text-sm font-semibold cursor-pointer"><ImagePlus size={16} />{uploading ? "Uploading..." : "Upload Photos"}<input type="file" accept="image/*" multiple className="hidden" disabled={uploading} onChange={(event) => { void uploadPhotos(event.target.files); event.currentTarget.value = ""; }} /></label>}</div>
                {!selectedProperty ? <p className="text-sm text-gray-400 border border-dashed border-gray-300 rounded-xl p-6 text-center">Save the property first, then upload photos.</p> : selectedPropertyPhotos.length === 0 ? <p className="text-sm text-gray-400 border border-dashed border-gray-300 rounded-xl p-6 text-center">No photos uploaded.</p> : <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{selectedPropertyPhotos.map((photo) => <div key={photo.id} className="relative group"><img src={photo.url} alt={photo.caption || "Property"} className="w-full aspect-square object-cover rounded-lg border border-gray-200" /><button type="button" onClick={() => void deletePropertyPhoto(photo)} className="absolute top-2 right-2 p-1.5 rounded-md bg-black/65 text-white opacity-0 group-hover:opacity-100 cursor-pointer"><Trash2 size={14} /></button></div>)}</div>}
              </div>

              {selectedProperty && (
                <div className="border-t border-gray-100 pt-6">
                  <h3 className="font-bold text-gray-900 mb-4">Previous estimates and jobs</h3>
                  {selectedPropertyProjects.length === 0 ? <p className="text-sm text-gray-400">No records linked to this property yet.</p> : <div className="space-y-2">{selectedPropertyProjects.map((project) => <Link key={project.id} to={`/app/estimates/${project.id}`} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-green-300"><FileText size={17} className="text-green-700 shrink-0" /><div className="flex-1 min-w-0"><p className="text-sm font-semibold text-gray-900 truncate">{project.name}</p><p className="text-xs text-gray-400">{project.estimateNumber} · {new Date(project.updatedAt).toLocaleDateString("en-US")}</p></div><p className="font-bold text-gray-900 text-sm">{formatMoney(project.totalEstimate)}</p></Link>)}</div>}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between"><div>{selectedProperty && <button type="button" onClick={() => void removeProperty()} className="inline-flex items-center gap-2 text-red-600 text-sm font-semibold cursor-pointer"><Trash2 size={15} /> Delete Property</button>}</div><div className="flex gap-2"><button type="button" onClick={closePropertyModal} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 cursor-pointer">Cancel</button><button type="button" onClick={() => void saveProperty()} disabled={propertySaving} className="px-5 py-2.5 bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-60 cursor-pointer">{propertySaving ? "Saving..." : selectedProperty ? "Update Property" : "Create Property"}</button></div></div>
          </div>
        </div>
      )}
    </div>
  );
}

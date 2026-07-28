import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
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
} from "../data/types";

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
  "id" | "createdAt" | "updatedAt"
>;

function uid() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2, 11)
  );
}

function emptyDraft(): ContactDraft {
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

function contactAddress(contact: Contact) {
  const cityStateZip = [
    contact.city,
    contact.state,
    contact.zip,
  ]
    .filter(Boolean)
    .join(" ");

  return [contact.address, cityStateZip]
    .filter(Boolean)
    .join(", ");
}

function typeClasses(contactType: ContactType) {
  return contactType === "customer"
    ? "bg-blue-100 text-blue-700"
    : "bg-amber-100 text-amber-700";
}

function activityClasses(
  activityStatus: ContactActivity
) {
  return activityStatus === "active"
    ? "bg-green-100 text-green-700"
    : "bg-gray-100 text-gray-600";
}

export default function Contacts() {
  const {
    contacts,
    contactsLoading,
    contactsError,
    addContact,
    updateContact,
    deleteContact,
  } = useApp();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<
    "all" | ContactType
  >("all");
  const [activityFilter, setActivityFilter] =
    useState<"all" | ContactActivity>("all");
  const [modalOpen, setModalOpen] =
    useState(false);
  const [selected, setSelected] =
    useState<Contact | null>(null);
  const [draft, setDraft] =
    useState<ContactDraft>(emptyDraft);
  const [saving, setSaving] =
    useState(false);
  const [modalError, setModalError] =
    useState("");

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

        if (!query) {
          return true;
        }

        return [
          contact.name,
          contact.email,
          contact.phone,
          contact.address,
          contact.city,
          contact.state,
          contact.zip,
          contact.contactType,
          contact.activityStatus,
          contact.source,
        ].some((value) =>
          value.toLowerCase().includes(query)
        );
      })
      .sort((first, second) => {
        if (
          first.activityStatus !==
          second.activityStatus
        ) {
          return first.activityStatus === "active"
            ? -1
            : 1;
        }

        const updatedDifference =
          new Date(second.updatedAt).getTime() -
          new Date(first.updatedAt).getTime();

        if (updatedDifference !== 0) {
          return updatedDifference;
        }

        return first.name.localeCompare(second.name);
      });
  }, [
    contacts,
    search,
    typeFilter,
    activityFilter,
  ]);

  useEffect(() => {
    if (!modalOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        closeModal();
      }
    }

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [modalOpen, saving]);

  function setField<K extends keyof ContactDraft>(
    key: K,
    value: ContactDraft[K]
  ) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function openNewContact() {
    setSelected(null);
    setDraft(emptyDraft());
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
    setModalError("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) {
      return;
    }

    setModalOpen(false);
    setSelected(null);
    setDraft(emptyDraft());
    setModalError("");
  }

  async function saveContact() {
    setModalError("");

    if (!draft.name.trim()) {
      setModalError(
        "Enter a contact name before saving."
      );
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();

    try {
      if (selected) {
        await updateContact({
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
      } else {
        await addContact({
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
      }

      setModalOpen(false);
      setSelected(null);
      setDraft(emptyDraft());
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
    if (!selected) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selected.name}? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setModalError("");
    setSaving(true);

    try {
      await deleteContact(selected.id);
      setModalOpen(false);
      setSelected(null);
      setDraft(emptyDraft());
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

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30";
  const labelClass =
    "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-7">
        <div>
          <h1
            className="text-2xl font-bold text-gray-900"
            style={{
              fontFamily:
                "'Plus Jakarta Sans', sans-serif",
            }}
          >
            Contacts
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Keep customer and lead details in one place.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewContact}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 transition-colors cursor-pointer"
        >
          <Plus size={16} /> Add Contact
        </button>
      </div>

      <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative w-full max-w-md">
          <Search
            size={17}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search contacts..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
            <span className="px-2 text-xs font-semibold text-gray-400">
              Type
            </span>
            {([
              ["all", "All"],
              ["lead", "Leads"],
              ["customer", "Customers"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTypeFilter(value)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  typeFilter === value
                    ? "bg-green-700 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
            <span className="px-2 text-xs font-semibold text-gray-400">
              Activity
            </span>
            {([
              ["all", "All"],
              ["active", "Active"],
              ["inactive", "Inactive"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() =>
                  setActivityFilter(value)
                }
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  activityFilter === value
                    ? "bg-green-700 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {contactsError && (
        <div className="mb-5 text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          Could not load contacts: {contactsError}
        </div>
      )}

      {contactsLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center text-sm text-gray-400">
          Loading contacts...
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
          <div className="w-11 h-11 rounded-xl bg-green-50 text-green-700 flex items-center justify-center mx-auto mb-3">
            <UserRound size={21} />
          </div>
          <p className="font-semibold text-gray-700">
            {contacts.length === 0
              ? "No contacts yet"
              : "No matching contacts"}
          </p>
          <p className="text-sm text-gray-400 mt-1">
            {contacts.length === 0
              ? "Add your first customer or lead."
              : "Try a different search or filter."}
          </p>
          {contacts.length === 0 && (
            <button
              type="button"
              onClick={openNewContact}
              className="mt-4 text-sm font-semibold text-green-700 hover:underline cursor-pointer"
            >
              + Add first contact
            </button>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredContacts.map((contact) => {
            const address = contactAddress(contact);

            return (
              <button
                type="button"
                key={contact.id}
                onClick={() => openContact(contact)}
                className="text-left bg-white border border-gray-200 rounded-xl p-5 hover:border-green-300 hover:shadow-sm transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 truncate">
                      {contact.name}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {contact.source || "No source"}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${typeClasses(
                        contact.contactType
                      )}`}
                    >
                      {contact.contactType}
                    </span>
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${activityClasses(
                        contact.activityStatus
                      )}`}
                    >
                      {contact.activityStatus}
                    </span>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-start gap-2.5 text-sm text-gray-600">
                    <Phone
                      size={15}
                      className="text-green-700 mt-0.5 shrink-0"
                    />
                    <span className="truncate">
                      {contact.phone || "No phone"}
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5 text-sm text-gray-600">
                    <Mail
                      size={15}
                      className="text-green-700 mt-0.5 shrink-0"
                    />
                    <span className="truncate">
                      {contact.email || "No email"}
                    </span>
                  </div>
                  <div className="flex items-start gap-2.5 text-sm text-gray-600">
                    <MapPin
                      size={15}
                      className="text-green-700 mt-0.5 shrink-0"
                    />
                    <span className="line-clamp-2">
                      {address || "No address"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-modal-title"
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl"
          >
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-5 flex items-center justify-between z-10">
              <div>
                <h2
                  id="contact-modal-title"
                  className="text-xl font-bold text-gray-900"
                >
                  {selected
                    ? "Edit Contact"
                    : "Add Contact"}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {selected
                    ? "Update this contact's information."
                    : "Add a customer or lead to your account."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                aria-label="Close contact editor"
                className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    Full Name
                  </label>
                  <input
                    autoFocus
                    value={draft.name}
                    onChange={(event) =>
                      setField("name", event.target.value)
                    }
                    placeholder="Alex Rivera"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={draft.email}
                    onChange={(event) =>
                      setField("email", event.target.value)
                    }
                    placeholder="alex@example.com"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={draft.phone}
                    onChange={(event) =>
                      setField("phone", event.target.value)
                    }
                    placeholder="(503) 555-0100"
                    className={inputClass}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    Street Address
                  </label>
                  <input
                    value={draft.address}
                    onChange={(event) =>
                      setField("address", event.target.value)
                    }
                    placeholder="123 Main Street"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    City
                  </label>
                  <input
                    value={draft.city}
                    onChange={(event) =>
                      setField("city", event.target.value)
                    }
                    placeholder="Salem"
                    className={inputClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>
                      State
                    </label>
                    <input
                      value={draft.state}
                      onChange={(event) =>
                        setField("state", event.target.value)
                      }
                      placeholder="OR"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      ZIP
                    </label>
                    <input
                      value={draft.zip}
                      onChange={(event) =>
                        setField("zip", event.target.value)
                      }
                      placeholder="97301"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>
                    Contact Type
                  </label>
                  <select
                    value={draft.contactType}
                    onChange={(event) =>
                      setField(
                        "contactType",
                        event.target.value as ContactType
                      )
                    }
                    className={inputClass}
                  >
                    {CONTACT_TYPE_OPTIONS.map(
                      (option) => (
                        <option
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>
                    Activity
                  </label>
                  <select
                    value={draft.activityStatus}
                    onChange={(event) =>
                      setField(
                        "activityStatus",
                        event.target
                          .value as ContactActivity
                      )
                    }
                    className={inputClass}
                  >
                    {ACTIVITY_OPTIONS.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>
                    Source
                  </label>
                  <select
                    value={draft.source}
                    onChange={(event) =>
                      setField("source", event.target.value)
                    }
                    className={inputClass}
                  >
                    {SOURCE_OPTIONS.map((source) => (
                      <option key={source || "blank"} value={source}>
                        {source || "Not specified"}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    Notes
                  </label>
                  <textarea
                    rows={5}
                    value={draft.notes}
                    onChange={(event) =>
                      setField("notes", event.target.value)
                    }
                    placeholder="Preferences, project history, follow-up details..."
                    className={`${inputClass} resize-y`}
                  />
                </div>
              </div>

              {modalError && (
                <p className="text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {modalError}
                </p>
              )}
            </div>

            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                {selected && (
                  <button
                    type="button"
                    onClick={() => void removeContact()}
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-red-600 font-semibold text-sm rounded-lg hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 size={16} /> Delete
                  </button>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="px-4 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveContact()}
                  disabled={saving}
                  className="px-5 py-2.5 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving
                    ? "Saving..."
                    : selected
                      ? "Update Contact"
                      : "Create Contact"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
import { useMemo, useState } from "react";
import {
  Briefcase,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Plus,
  ReceiptText,
  UserRound,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type { ScheduleEvent, ScheduleSourceType } from "../data/types";

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 11);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dayKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function toLocalInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function eventIcon(source: ScheduleSourceType) {
  if (source === "project") return Briefcase;
  if (source === "invoice") return ReceiptText;
  return CalendarDays;
}

function sourceClasses(source: ScheduleSourceType) {
  if (source === "project") return "bg-green-100 text-green-700 border-green-200";
  if (source === "invoice") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-blue-100 text-blue-700 border-blue-200";
}

type EventDraft = {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  assignedUserId: string;
};

function blankDraft(date = new Date()): EventDraft {
  const start = new Date(date);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(10, 0, 0, 0);
  return {
    title: "",
    description: "",
    startAt: toLocalInput(start),
    endAt: toLocalInput(end),
    allDay: false,
    assignedUserId: "",
  };
}

export default function Schedule() {
  const {
    authUserId,
    activeWorkspaceId,
    role,
    workspaceMembers,
    scheduleEvents,
    scheduleLoading,
    scheduleError,
    addScheduleEvent,
    updateScheduleEvent,
    deleteScheduleEvent,
  } = useApp();

  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [filter, setFilter] = useState<"all" | ScheduleSourceType>("all");
  const [selectedDay, setSelectedDay] = useState(dayKey(new Date()));
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const [draft, setDraft] = useState<EventDraft>(blankDraft);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  const filteredEvents = useMemo(
    () =>
      [...scheduleEvents]
        .filter((event) => filter === "all" || event.sourceType === filter)
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [scheduleEvents, filter]
  );

  const days = useMemo(() => {
    const first = startOfMonth(month);
    const leading = first.getDay();
    const start = new Date(first);
    start.setDate(start.getDate() - leading);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [month]);

  const selectedEvents = filteredEvents.filter(
    (event) => dayKey(event.startAt) === selectedDay
  );
  const upcoming = filteredEvents
    .filter((event) => new Date(event.startAt).getTime() >= Date.now() - 24 * 60 * 60 * 1000)
    .slice(0, 8);

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30";
  const labelClass =
    "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

  function changeMonth(direction: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  }

  function openNew(date?: Date) {
    setSelectedEvent(null);
    setDraft(blankDraft(date));
    setModalError("");
    setModalOpen(true);
  }

  function openEvent(event: ScheduleEvent) {
    setSelectedEvent(event);
    setDraft({
      title: event.title,
      description: event.description,
      startAt: toLocalInput(new Date(event.startAt)),
      endAt: event.endAt ? toLocalInput(new Date(event.endAt)) : "",
      allDay: event.allDay,
      assignedUserId: event.assignedUserId ?? "",
    });
    setModalError("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setSelectedEvent(null);
    setDraft(blankDraft());
    setModalError("");
  }

  async function saveEvent() {
    setModalError("");
    if (!draft.title.trim()) {
      setModalError("Enter an event title.");
      return;
    }
    if (!activeWorkspaceId || !authUserId) {
      setModalError("Workspace is still loading.");
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    const assignedUserId =
      role === "employee" ? authUserId : draft.assignedUserId || null;

    try {
      if (selectedEvent) {
        if (selectedEvent.sourceType !== "manual") {
          setModalError("Automatic project and invoice events are edited from their linked record.");
          return;
        }
        await updateScheduleEvent({
          ...selectedEvent,
          title: draft.title.trim(),
          description: draft.description.trim(),
          startAt: new Date(draft.startAt).toISOString(),
          endAt: draft.endAt ? new Date(draft.endAt).toISOString() : null,
          allDay: draft.allDay,
          assignedUserId,
          updatedAt: now,
        });
      } else {
        await addScheduleEvent({
          id: uid(),
          workspaceId: activeWorkspaceId,
          createdBy: authUserId,
          title: draft.title.trim(),
          description: draft.description.trim(),
          startAt: new Date(draft.startAt).toISOString(),
          endAt: draft.endAt ? new Date(draft.endAt).toISOString() : null,
          allDay: draft.allDay,
          sourceType: "manual",
          projectId: null,
          invoiceId: null,
          contactId: null,
          assignedUserId,
          status: "scheduled",
          autoKey: null,
          createdAt: now,
          updatedAt: now,
        });
      }
      setModalOpen(false);
      setSelectedEvent(null);
      setDraft(blankDraft());
      setModalError("");
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "The event could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function removeEvent() {
    if (!selectedEvent || selectedEvent.sourceType !== "manual") return;
    if (!window.confirm("Delete this calendar event?")) return;
    setSaving(true);
    try {
      await deleteScheduleEvent(selectedEvent.id);
      setModalOpen(false);
      setSelectedEvent(null);
      setDraft(blankDraft());
      setModalError("");
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "The event could not be deleted.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          <p className="text-sm text-gray-500 mt-1">
            Jobs and invoice due dates appear automatically. Add manual appointments or reminders here.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openNew()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800 cursor-pointer"
        >
          <Plus size={16} /> Add Event
        </button>
      </div>

      {scheduleError && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {scheduleError}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-5">
        {(["all", "project", "invoice", "manual"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`px-3 py-2 rounded-lg text-sm font-semibold capitalize cursor-pointer ${
              filter === value
                ? "bg-green-700 text-white"
                : "bg-white border border-gray-200 text-gray-600"
            }`}
          >
            {value === "all" ? "All" : value === "project" ? "Jobs / Estimates" : value}
          </button>
        ))}
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_340px] gap-6">
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 cursor-pointer"
            >
              <ChevronLeft size={17} />
            </button>
            <h2 className="font-bold text-gray-900">
              {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h2>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 cursor-pointer"
            >
              <ChevronRight size={17} />
            </button>
          </div>

          <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="px-2 py-2 text-center text-xs font-bold text-gray-400">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((date) => {
              const key = dayKey(date);
              const dayEvents = filteredEvents.filter((event) => dayKey(event.startAt) === key);
              const outside = date.getMonth() !== month.getMonth();
              const selected = key === selectedDay;
              const today = key === dayKey(new Date());
              return (
                <button
                  type="button"
                  key={key}
                  onClick={() => setSelectedDay(key)}
                  onDoubleClick={() => openNew(date)}
                  className={`min-h-28 border-r border-b border-gray-100 p-2 text-left align-top cursor-pointer transition-colors ${
                    selected ? "bg-green-50" : "hover:bg-gray-50"
                  }`}
                >
                  <span
                    className={`inline-flex w-7 h-7 items-center justify-center rounded-full text-xs font-semibold ${
                      today
                        ? "bg-green-700 text-white"
                        : outside
                          ? "text-gray-300"
                          : "text-gray-700"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                  <div className="mt-1 space-y-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <span
                        key={event.id}
                        className={`block truncate rounded px-1.5 py-1 text-[10px] font-semibold border ${sourceClasses(event.sourceType)}`}
                      >
                        {event.title}
                      </span>
                    ))}
                    {dayEvents.length > 3 && (
                      <span className="text-[10px] text-gray-400">+{dayEvents.length - 3} more</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <div className="space-y-5">
          <section className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-900">
                  {new Date(`${selectedDay}T12:00:00`).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">{selectedEvents.length} events</p>
              </div>
              <button
                type="button"
                onClick={() => openNew(new Date(`${selectedDay}T09:00:00`))}
                className="text-sm font-semibold text-green-700 cursor-pointer"
              >
                + Add
              </button>
            </div>
            <div className="p-4 space-y-3">
              {scheduleLoading ? (
                <p className="text-sm text-gray-400">Loading schedule...</p>
              ) : selectedEvents.length === 0 ? (
                <p className="text-sm text-gray-400">Nothing scheduled for this day.</p>
              ) : (
                selectedEvents.map((event) => {
                  const Icon = eventIcon(event.sourceType);
                  return (
                    <button
                      type="button"
                      key={event.id}
                      onClick={() => openEvent(event)}
                      className="w-full text-left rounded-xl border border-gray-200 p-3 hover:border-green-300 cursor-pointer"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${sourceClasses(event.sourceType)}`}>
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-900 text-sm">{event.title}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {event.allDay
                              ? "All day"
                              : new Date(event.startAt).toLocaleTimeString("en-US", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                          </p>
                          {event.description && (
                            <p className="text-xs text-gray-400 mt-1 line-clamp-2">{event.description}</p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-4">Upcoming</h2>
            <div className="space-y-3">
              {upcoming.length === 0 ? (
                <p className="text-sm text-gray-400">No upcoming events.</p>
              ) : (
                upcoming.map((event) => {
                  const member = workspaceMembers.find((item) => item.userId === event.assignedUserId);
                  return (
                    <button
                      type="button"
                      key={event.id}
                      onClick={() => openEvent(event)}
                      className="w-full text-left border-b border-gray-100 pb-3 last:border-0 last:pb-0 cursor-pointer"
                    >
                      <p className="text-sm font-semibold text-gray-900">{event.title}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-gray-400">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} />
                          {new Date(event.startAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: event.allDay ? undefined : "numeric",
                            minute: event.allDay ? undefined : "2-digit",
                          })}
                        </span>
                        {member && (
                          <span className="inline-flex items-center gap-1">
                            <UserRound size={12} /> {member.name}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[70] flex min-h-0 items-stretch sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="w-full h-[100dvh] sm:h-auto sm:max-w-xl sm:max-h-[92vh] sm:rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div>
                <h2 className="font-bold text-gray-900">
                  {selectedEvent ? "Schedule Event" : "Add Event"}
                </h2>
                {selectedEvent && (
                  <p className="text-xs text-gray-400 mt-0.5 capitalize">
                    {selectedEvent.sourceType} event
                  </p>
                )}
              </div>
              <button type="button" onClick={closeModal} className="text-gray-400 cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <div className="p-5 sm:p-6 min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-4">
              {modalError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {modalError}
                </div>
              )}
              <div>
                <label className={labelClass}>Title</label>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  disabled={selectedEvent?.sourceType !== undefined && selectedEvent.sourceType !== "manual"}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <textarea
                  rows={3}
                  value={draft.description}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  disabled={selectedEvent?.sourceType !== undefined && selectedEvent.sourceType !== "manual"}
                  className={inputClass}
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Start</label>
                  <input
                    type="datetime-local"
                    value={draft.startAt}
                    onChange={(event) => setDraft((current) => ({ ...current, startAt: event.target.value }))}
                    disabled={selectedEvent?.sourceType !== undefined && selectedEvent.sourceType !== "manual"}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>End</label>
                  <input
                    type="datetime-local"
                    value={draft.endAt}
                    onChange={(event) => setDraft((current) => ({ ...current, endAt: event.target.value }))}
                    disabled={selectedEvent?.sourceType !== undefined && selectedEvent.sourceType !== "manual"}
                    className={inputClass}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={draft.allDay}
                  onChange={(event) => setDraft((current) => ({ ...current, allDay: event.target.checked }))}
                  disabled={selectedEvent?.sourceType !== undefined && selectedEvent.sourceType !== "manual"}
                  className="accent-green-700"
                />
                All-day event
              </label>
              {role !== "employee" && (
                <div>
                  <label className={labelClass}>Assigned To</label>
                  <select
                    value={draft.assignedUserId}
                    onChange={(event) => setDraft((current) => ({ ...current, assignedUserId: event.target.value }))}
                    disabled={selectedEvent?.sourceType !== undefined && selectedEvent.sourceType !== "manual"}
                    className={inputClass}
                  >
                    <option value="">Unassigned</option>
                    {workspaceMembers.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.name} — {member.role}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {selectedEvent?.sourceType !== undefined && selectedEvent.sourceType !== "manual" && (
                <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-500">
                  This event is generated from a linked project or invoice. Edit that record to change its date.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 px-6 py-4">
              <div>
                {selectedEvent?.sourceType === "manual" && (
                  <button
                    type="button"
                    onClick={() => void removeEvent()}
                    disabled={saving}
                    className="text-sm font-semibold text-red-600 cursor-pointer"
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={closeModal} className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 cursor-pointer">
                  Close
                </button>
                {(!selectedEvent || selectedEvent.sourceType === "manual") && (
                  <button
                    type="button"
                    onClick={() => void saveEvent()}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {saving ? "Saving..." : selectedEvent ? "Update Event" : "Add Event"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

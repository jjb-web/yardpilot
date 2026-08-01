import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  Loader2,
  PlusCircle,
  ReceiptText,
  XCircle,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";

const PAYMENT_METHODS = [
  ["payroll_provider", "Payroll provider"],
  ["bank_transfer", "Bank transfer / ACH"],
  ["cash", "Cash"],
  ["check", "Check"],
  ["card", "Card outside YardPilot"],
  ["other", "Other"],
] as const;

type PaymentRecord = {
  id: string;
  workspace_id: string;
  employee_user_id: string;
  created_by: string;
  period_start: string | null;
  period_end: string | null;
  scheduled_for: string | null;
  hours: number | string;
  hourly_rate: number | string;
  adjustment_amount: number | string;
  gross_amount: number | string;
  status: "draft" | "due" | "paid" | "void";
  payment_method: string;
  external_reference: string;
  notes: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

type FormState = {
  employeeUserId: string;
  periodStart: string;
  periodEnd: string;
  scheduledFor: string;
  hours: string;
  hourlyRate: string;
  adjustmentAmount: string;
  status: "draft" | "due" | "paid";
  paymentMethod: string;
  externalReference: string;
  notes: string;
};

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function EmployeePayments() {
  const {
    activeWorkspaceId,
    authUserId,
    role,
    workspaceMembers,
  } = useApp();
  const canManage = role === "owner" || role === "co_owner" || role === "manager";
  const employees = useMemo(
    () => workspaceMembers.filter((member) => member.role === "employee"),
    [workspaceMembers],
  );

  const [records, setRecords] = useState<PaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<FormState>({
    employeeUserId: "",
    periodStart: "",
    periodEnd: "",
    scheduledFor: today(),
    hours: "",
    hourlyRate: "",
    adjustmentAmount: "0",
    status: "due",
    paymentMethod: "payroll_provider",
    externalReference: "",
    notes: "",
  });

  const gross = Math.max(
    0,
    Number(form.hours || 0) * Number(form.hourlyRate || 0) +
      Number(form.adjustmentAmount || 0),
  );

  async function load() {
    if (!activeWorkspaceId) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase
      .from("employee_payment_records")
      .select("*")
      .eq("workspace_id", activeWorkspaceId)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (loadError) {
      setError(loadError.message);
      return;
    }
    setRecords((data ?? []) as PaymentRecord[]);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, role]);

  function chooseEmployee(userId: string) {
    const member = employees.find((item) => item.userId === userId);
    setForm((current) => ({
      ...current,
      employeeUserId: userId,
      hourlyRate: member ? String(member.hourlyRate || "") : current.hourlyRate,
    }));
  }

  async function createRecord() {
    if (!canManage || !activeWorkspaceId || !authUserId) return;
    if (!form.employeeUserId) {
      setError("Choose an employee.");
      return;
    }
    if (Number(form.hours || 0) < 0 || Number(form.hourlyRate || 0) < 0) {
      setError("Hours and hourly rate cannot be negative.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    const { error: insertError } = await supabase
      .from("employee_payment_records")
      .insert({
        workspace_id: activeWorkspaceId,
        employee_user_id: form.employeeUserId,
        created_by: authUserId,
        period_start: form.periodStart || null,
        period_end: form.periodEnd || null,
        scheduled_for: form.scheduledFor || null,
        hours: Number(form.hours || 0),
        hourly_rate: Number(form.hourlyRate || 0),
        adjustment_amount: Number(form.adjustmentAmount || 0),
        gross_amount: gross,
        status: form.status,
        payment_method: form.paymentMethod,
        external_reference: form.externalReference.trim(),
        notes: form.notes.trim(),
        paid_at: form.status === "paid" ? new Date().toISOString() : null,
        paid_by: form.status === "paid" ? authUserId : null,
      });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setForm((current) => ({
      ...current,
      employeeUserId: "",
      periodStart: "",
      periodEnd: "",
      hours: "",
      hourlyRate: "",
      adjustmentAmount: "0",
      externalReference: "",
      notes: "",
    }));
    setShowForm(false);
    setMessage("Employee payment record saved.");
    await load();
  }

  async function setStatus(
    record: PaymentRecord,
    status: "due" | "paid" | "void",
  ) {
    if (!canManage || !authUserId) return;
    setBusyId(record.id);
    setError("");
    const { error: updateError } = await supabase
      .from("employee_payment_records")
      .update({
        status,
        paid_at: status === "paid" ? new Date().toISOString() : null,
        paid_by: status === "paid" ? authUserId : null,
      })
      .eq("id", record.id);
    setBusyId("");
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage(status === "paid" ? "Payment marked paid." : "Payment record updated.");
    await load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-7">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-slate-900">
            <Banknote size={24} /> Employee payments
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Owners and managers record pay periods and payment status. Employees can view only their own records.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowForm((current) => !current)}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
          >
            {showForm ? <XCircle size={16} /> : <PlusCircle size={16} />}
            {showForm ? "Close form" : "New payment record"}
          </button>
        )}
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        YardPilot records the payment and its external method; it does not calculate payroll taxes, withholdings, benefits, or transmit employee wages. Use a payroll provider or another lawful payment method, then mark the record paid here.
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}

      {showForm && canManage && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">New employee payment record</h2>
          {employees.length === 0 ? (
            <p className="mt-3 text-sm text-amber-700">Add an employee under Team before creating a payment record.</p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className="text-sm font-medium text-slate-700">Employee
                <select value={form.employeeUserId} onChange={(event) => chooseEmployee(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5">
                  <option value="">Choose employee</option>
                  {employees.map((employee) => (
                    <option key={employee.userId} value={employee.userId}>{employee.name} · {employee.positionTitle || "Employee"}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Period start
                <input type="date" value={form.periodStart} onChange={(event) => setForm((current) => ({ ...current, periodStart: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Period end
                <input type="date" value={form.periodEnd} onChange={(event) => setForm((current) => ({ ...current, periodEnd: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Hours
                <input type="number" min="0" step="0.25" value={form.hours} onChange={(event) => setForm((current) => ({ ...current, hours: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Hourly rate
                <input type="number" min="0" step="0.01" value={form.hourlyRate} onChange={(event) => setForm((current) => ({ ...current, hourlyRate: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Adjustment / bonus
                <input type="number" step="0.01" value={form.adjustmentAmount} onChange={(event) => setForm((current) => ({ ...current, adjustmentAmount: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Scheduled date
                <input type="date" value={form.scheduledFor} onChange={(event) => setForm((current) => ({ ...current, scheduledFor: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Status
                <select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FormState["status"] }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5">
                  <option value="draft">Draft</option>
                  <option value="due">Due</option>
                  <option value="paid">Already paid</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">Payment method
                <select value={form.paymentMethod} onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5">
                  {PAYMENT_METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700 lg:col-span-2">External reference
                <input value={form.externalReference} onChange={(event) => setForm((current) => ({ ...current, externalReference: event.target.value }))} placeholder="Payroll batch, check number, transfer reference…" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-3">Notes
                <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={4} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-600">Calculated gross</p>
            <p className="text-2xl font-bold text-slate-900">{money(gross)}</p>
          </div>
          <button type="button" onClick={() => void createRecord()} disabled={saving || employees.length === 0} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving && <Loader2 size={16} className="animate-spin" />} Save payment record
          </button>
        </section>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading employee payments…</p>
      ) : (
        <div className="space-y-4">
          {records.map((record) => {
            const member = workspaceMembers.find((item) => item.userId === record.employee_user_id);
            const method = PAYMENT_METHODS.find(([value]) => value === record.payment_method)?.[1] || record.payment_method || "Not selected";
            return (
              <article key={record.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{record.status}</p>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">{member?.name || (record.employee_user_id === authUserId ? "Your payment" : "Employee payment")}</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {record.period_start || record.period_end
                        ? `${record.period_start || "Start not set"} – ${record.period_end || "End not set"}`
                        : "Pay period not specified"}
                    </p>
                  </div>
                  <p className="text-2xl font-bold text-slate-900">{money(record.gross_amount)}</p>
                </div>

                <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                  <p><strong>Hours:</strong> {Number(record.hours || 0).toLocaleString()}</p>
                  <p><strong>Rate:</strong> {money(record.hourly_rate)}</p>
                  <p><strong>Adjustment:</strong> {money(record.adjustment_amount)}</p>
                  <p><strong>Method:</strong> {method}</p>
                  {record.scheduled_for && <p><strong>Scheduled:</strong> {new Date(`${record.scheduled_for}T00:00:00`).toLocaleDateString()}</p>}
                  {record.paid_at && <p><strong>Paid:</strong> {new Date(record.paid_at).toLocaleString()}</p>}
                  {record.external_reference && <p className="sm:col-span-2"><strong>Reference:</strong> {record.external_reference}</p>}
                </div>
                {record.notes && <p className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{record.notes}</p>}

                {canManage && record.status !== "void" && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {record.status !== "paid" && <button type="button" onClick={() => void setStatus(record, "paid")} disabled={busyId === record.id} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><CheckCircle2 size={14} /> Mark paid</button>}
                    {record.status === "draft" && <button type="button" onClick={() => void setStatus(record, "due")} disabled={busyId === record.id} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"><ReceiptText size={14} /> Mark due</button>}
                    <button type="button" onClick={() => void setStatus(record, "void")} disabled={busyId === record.id} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700">Void</button>
                  </div>
                )}
              </article>
            );
          })}
          {records.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No employee payment records yet.</div>}
        </div>
      )}
    </div>
  );
}

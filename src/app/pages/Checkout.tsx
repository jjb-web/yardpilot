import { useState } from "react";
import { Link } from "react-router";
import { useCart } from "../context/CartContext";

export default function Checkout() {
  const { items, clear } = useCart();
  const total = items.reduce((sum, i) => sum + i.priceNum * i.qty, 0);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", address: "", city: "", state: "", zip: "",
    delivery: "pickup", notes: "",
  });

  function set(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    clear();
  }

  if (items.length === 0 && !submitted) {
    return (
      <div className="bg-background min-h-[60vh] flex flex-col items-center justify-center px-6 text-center" style={{ fontFamily: "'Inter', sans-serif" }}>
        <p className="text-3xl font-bold text-foreground mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>
          Nothing to check out
        </p>
        <Link to="/market" className="mt-4 px-8 py-3 bg-amber-700 text-white font-semibold rounded-sm hover:bg-amber-800 transition-colors">
          Browse the Market
        </Link>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="bg-background min-h-[60vh] flex flex-col items-center justify-center px-6 text-center" style={{ fontFamily: "'Inter', sans-serif" }}>
        <div className="max-w-md">
          <div className="w-14 h-14 rounded-full border-2 border-amber-700 flex items-center justify-center mx-auto mb-6 text-amber-700 text-2xl">
            ✓
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>
            Order Request Sent
          </h1>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Thanks! Hank will call you within one business day to confirm availability,
            arrange pickup or delivery, and settle payment. Orders aren't finalized until
            you hear from us.
          </p>
          <Link to="/" className="px-8 py-3 bg-amber-700 text-white font-semibold rounded-sm hover:bg-amber-800 transition-colors">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const inputClass = "w-full px-4 py-2.5 rounded-sm border border-border bg-input-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-amber-700/30 transition";
  const labelClass = "block text-sm font-medium text-foreground mb-1.5";

  return (
    <div className="bg-background py-14 px-6 min-h-screen" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-4xl mx-auto">
        <Link to="/cart" className="text-sm text-muted-foreground hover:text-foreground transition-colors mb-6 inline-block">
          ← Back to cart
        </Link>
        <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-10" style={{ fontFamily: "'Playfair Display', serif" }}>
          Checkout
        </h1>

        <div className="grid md:grid-cols-3 gap-10">
          {/* Form */}
          <form onSubmit={handleSubmit} className="md:col-span-2 space-y-6">
            <div>
              <h2 className="text-lg font-bold text-foreground mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>Contact Information</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Full Name</label>
                  <input required type="text" placeholder="John Smith" value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Phone</label>
                  <input required type="tel" placeholder="(208) 555-0100" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} />
                </div>
              </div>
              <div className="mt-4">
                <label className={labelClass}>Email</label>
                <input required type="email" placeholder="you@example.com" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass} />
              </div>
            </div>

            <div>
              <h2 className="text-lg font-bold text-foreground mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>Pickup or Delivery?</h2>
              <div className="flex gap-4 mb-4">
                {["pickup", "delivery"].map((opt) => (
                  <label key={opt} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="delivery"
                      value={opt}
                      checked={form.delivery === opt}
                      onChange={() => set("delivery", opt)}
                      className="accent-amber-700"
                    />
                    <span className="text-foreground capitalize text-sm font-medium">{opt}</span>
                  </label>
                ))}
              </div>

              {form.delivery === "delivery" && (
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Street Address</label>
                    <input type="text" placeholder="1234 County Rd" value={form.address} onChange={(e) => set("address", e.target.value)} className={inputClass} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1">
                      <label className={labelClass}>City</label>
                      <input type="text" value={form.city} onChange={(e) => set("city", e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>State</label>
                      <input type="text" placeholder="ID" maxLength={2} value={form.state} onChange={(e) => set("state", e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>ZIP</label>
                      <input type="text" placeholder="83638" value={form.zip} onChange={(e) => set("zip", e.target.value)} className={inputClass} />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">Delivery available within 30 miles of Valley County. Hank will confirm eligibility when he calls.</p>
                </div>
              )}
            </div>

            <div>
              <label className={labelClass}>Notes (optional)</label>
              <textarea rows={3} placeholder="Anything we should know — timing, quantities, special requests…" value={form.notes} onChange={(e) => set("notes", e.target.value)} className={`${inputClass} resize-none`} />
            </div>

            <button type="submit" className="w-full py-4 bg-amber-700 text-white font-semibold rounded-sm hover:bg-amber-800 transition-colors">
              Submit Order Request
            </button>
            <p className="text-xs text-muted-foreground text-center">
              This sends a request — Hank will call to confirm before anything is finalized. Payment is arranged directly.
            </p>
          </form>

          {/* Order summary */}
          <div>
            <div className="bg-card border border-border rounded-sm p-5 sticky top-24">
              <h2 className="text-base font-bold text-foreground mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>Order Summary</h2>
              <ul className="space-y-3 mb-5">
                {items.map((item) => (
                  <li key={item.id} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{item.name} × {item.qty}</span>
                    <span className="text-foreground font-medium tabular-nums">
                      {item.priceNum > 0 ? `$${(item.priceNum * item.qty).toFixed(2)}` : "TBD"}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border pt-4 flex justify-between">
                <span className="font-medium text-foreground">Est. Total</span>
                <span className="font-bold text-foreground">{total > 0 ? `$${total.toFixed(2)}` : "—"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

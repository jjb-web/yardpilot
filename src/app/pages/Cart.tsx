import { Link } from "react-router";
import { Trash2 } from "lucide-react";
import { useCart } from "../context/CartContext";

export default function Cart() {
  const { items, removeItem, updateQty } = useCart();
  const total = items.reduce((sum, i) => sum + i.priceNum * i.qty, 0);
  const hasCallItems = items.some((i) => i.priceNum === 0);

  if (items.length === 0) {
    return (
      <div className="bg-background min-h-[60vh] flex flex-col items-center justify-center px-6 text-center" style={{ fontFamily: "'Inter', sans-serif" }}>
        <p
          className="text-3xl font-bold text-foreground mb-3"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          Your cart is empty
        </p>
        <p className="text-muted-foreground mb-8">Head back to the market to add items.</p>
        <Link
          to="/market"
          className="px-8 py-3 bg-amber-700 text-white font-semibold rounded-sm hover:bg-amber-800 transition-colors"
        >
          Browse the Market
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-background py-14 px-6 min-h-screen" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-3xl mx-auto">
        <h1
          className="text-3xl md:text-4xl font-bold text-foreground mb-10"
          style={{ fontFamily: "'Playfair Display', serif" }}
        >
          Your Cart
        </h1>

        <div className="space-y-4 mb-10">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-card border border-border rounded-sm p-5 flex items-start gap-5"
            >
              <div className="flex-1">
                <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1 capitalize">
                  {item.category}
                </p>
                <p
                  className="font-bold text-foreground text-lg"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {item.name}
                </p>
                <p className="text-muted-foreground text-sm mt-0.5">{item.price}</p>
              </div>

              <div className="flex items-center gap-3">
                {item.priceNum > 0 ? (
                  <>
                    <button
                      onClick={() => updateQty(item.id, item.qty - 1)}
                      className="w-8 h-8 border border-border rounded-sm text-foreground hover:border-foreground transition-colors"
                    >
                      −
                    </button>
                    <span className="w-5 text-center font-medium text-foreground">{item.qty}</span>
                    <button
                      onClick={() => updateQty(item.id, item.qty + 1)}
                      className="w-8 h-8 border border-border rounded-sm text-foreground hover:border-foreground transition-colors"
                    >
                      +
                    </button>
                    <span className="text-foreground font-bold w-20 text-right tabular-nums">
                      ${(item.priceNum * item.qty).toFixed(2)}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground text-sm italic">Call for price</span>
                )}
                <button
                  onClick={() => removeItem(item.id)}
                  className="ml-2 text-muted-foreground hover:text-red-700 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="bg-card border border-border rounded-sm p-6">
          {hasCallItems && (
            <p className="text-sm text-muted-foreground mb-4 pb-4 border-b border-border">
              Some items require a call for pricing and aren't included in the total below.
              Hank will confirm those separately at{" "}
              <a href="tel:+12085550174" className="text-amber-700 hover:underline">(208) 555-0174</a>.
            </p>
          )}
          <div className="flex justify-between items-center mb-6">
            <span className="text-foreground font-medium">Estimated Total</span>
            <span
              className="text-2xl font-bold text-foreground"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              {total > 0 ? `$${total.toFixed(2)}` : "—"}
            </span>
          </div>
          <Link
            to="/checkout"
            className="block w-full py-4 bg-amber-700 text-white font-semibold rounded-sm text-center hover:bg-amber-800 transition-colors"
          >
            Proceed to Checkout
          </Link>
          <Link
            to="/market"
            className="block text-center mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Continue shopping
          </Link>
        </div>
      </div>
    </div>
  );
}

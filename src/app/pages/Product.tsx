import { useState } from "react";
import { Link, useParams, Navigate } from "react-router";
import { ShoppingCart, Check, ArrowLeft } from "lucide-react";
import { products } from "../data/products";
import { useCart } from "../context/CartContext";

export default function Product() {
  const { id } = useParams<{ id: string }>();
  const product = products.find((p) => p.id === id);
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  const [qty, setQty] = useState(1);

  if (!product) return <Navigate to="/market" replace />;

  function handleAdd() {
    for (let i = 0; i < qty; i++) {
      addItem({
        id: product!.id,
        name: product!.name,
        price: product!.price,
        priceNum: product!.priceNum,
        category: product!.category,
      });
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  const categoryImage = {
    livestock: "https://images.unsplash.com/photo-1641939193329-7071068dc40f?w=1200&h=400&fit=crop&auto=format",
    crops: "https://images.unsplash.com/photo-1732123280395-448294940895?w=1200&h=400&fit=crop&auto=format",
    services: "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=1200&h=400&fit=crop&auto=format",
  }[product.category];

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Back */}
      <div className="bg-background border-b border-border px-6 py-3">
        <div className="max-w-5xl mx-auto">
          <Link
            to="/market"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={14} /> Back to Market
          </Link>
        </div>
      </div>

      {/* Hero image */}
      <div
        className="relative h-56 bg-stone-400"
        style={{
          backgroundImage: `url('${categoryImage}')`,
          backgroundSize: "cover",
          backgroundPosition: "center 40%",
        }}
      >
        <div className="absolute inset-0 bg-black/50" />
        <div className="absolute bottom-0 left-0 max-w-5xl mx-auto w-full px-6 pb-6">
          <span className="text-xs uppercase tracking-widest text-amber-300 font-medium">
            {product.subcategory}
          </span>
          <h1
            className="text-white text-3xl md:text-4xl font-bold mt-1"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            {product.name}
          </h1>
        </div>
      </div>

      {/* Content */}
      <section className="bg-background py-12 px-6">
        <div className="max-w-5xl mx-auto grid md:grid-cols-3 gap-10">
          {/* Main */}
          <div className="md:col-span-2 space-y-8">
            <div>
              <h2
                className="text-xl font-bold text-foreground mb-3"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                About this listing
              </h2>
              <p className="text-foreground/80 leading-relaxed">{product.description}</p>
            </div>

            <div>
              <h2
                className="text-xl font-bold text-foreground mb-4"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                What's included
              </h2>
              <ul className="space-y-2.5">
                {product.details.map((detail) => (
                  <li key={detail} className="flex items-start gap-3 text-foreground/80">
                    <div className="w-5 h-5 rounded-full border border-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-700" />
                    </div>
                    {detail}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-card border border-border rounded-sm p-5">
              <p className="text-sm text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Questions?</strong> Call Hank at{" "}
                <a href="tel:+12085550174" className="text-amber-700 hover:underline">
                  (208) 555-0174
                </a>{" "}
                — mornings are best, 7 to 9 AM. We're happy to discuss availability, quantities,
                and delivery options before you order.
              </p>
            </div>
          </div>

          {/* Sidebar / order box */}
          <div>
            <div className="bg-card border border-border rounded-sm p-6 sticky top-24">
              <div className="mb-1">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">Price</span>
              </div>
              <p
                className="text-2xl font-bold text-foreground mb-1"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                {product.price}
              </p>
              <p className="text-xs text-muted-foreground mb-6">{product.unit}</p>

              {product.priceNum > 0 ? (
                <>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Quantity
                  </label>
                  <div className="flex items-center gap-3 mb-5">
                    <button
                      onClick={() => setQty(Math.max(1, qty - 1))}
                      className="w-9 h-9 border border-border rounded-sm text-foreground hover:border-foreground transition-colors font-bold"
                    >
                      −
                    </button>
                    <span className="text-foreground font-medium w-6 text-center">{qty}</span>
                    <button
                      onClick={() => setQty(qty + 1)}
                      className="w-9 h-9 border border-border rounded-sm text-foreground hover:border-foreground transition-colors font-bold"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={handleAdd}
                    disabled={added}
                    className={`w-full py-3 rounded-sm text-white font-semibold flex items-center justify-center gap-2 transition-colors ${
                      added ? "bg-green-700" : "bg-amber-700 hover:bg-amber-800"
                    }`}
                  >
                    {added ? (
                      <>
                        <Check size={16} /> Added to Cart
                      </>
                    ) : (
                      <>
                        <ShoppingCart size={16} /> Add to Cart
                      </>
                    )}
                  </button>
                  <Link
                    to="/cart"
                    className="block text-center mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    View cart →
                  </Link>
                </>
              ) : (
                <a
                  href="tel:+12085550174"
                  className="block w-full py-3 rounded-sm bg-amber-700 text-white font-semibold text-center hover:bg-amber-800 transition-colors"
                >
                  Call for Pricing
                </a>
              )}

              <div className="mt-6 pt-5 border-t border-border space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Category</span>
                  <span className="text-foreground capitalize">{product.category}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Availability</span>
                  <span className={product.available ? "text-green-700" : "text-red-700"}>
                    {product.available ? "In stock" : "Sold out"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

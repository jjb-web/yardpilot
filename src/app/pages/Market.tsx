import { useState } from "react";
import { Link } from "react-router";
import { products, categories } from "../data/products";

export default function Market() {
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const filtered = activeCategory === "all"
    ? products
    : products.filter((p) => p.category === activeCategory);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <section className="bg-card border-b border-border py-14 px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
            Hank Dillard &amp; Sons Farm
          </p>
          <h1
            className="text-4xl md:text-5xl font-bold text-foreground mb-4"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            The Market
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl">
            Livestock, hay, and farm services — all raised and worked right here in Valley County.
            Order online or call us to confirm availability.
          </p>
        </div>
      </section>

      {/* Category cards */}
      <section className="bg-background py-12 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid sm:grid-cols-3 gap-5 mb-12">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id === activeCategory ? "all" : cat.id)}
                className={`relative rounded-sm overflow-hidden text-left transition-all ${
                  activeCategory === cat.id ? "ring-2 ring-amber-700" : "opacity-80 hover:opacity-100"
                }`}
              >
                <div
                  className="h-36 bg-stone-400"
                  style={{
                    backgroundImage: `url('${cat.image}')`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div className="absolute bottom-0 left-0 p-4">
                  <p
                    className="text-white font-bold text-lg leading-tight"
                    style={{ fontFamily: "'Playfair Display', serif" }}
                  >
                    {cat.label}
                  </p>
                  <p className="text-stone-300 text-xs mt-0.5">{cat.description}</p>
                </div>
                {activeCategory === cat.id && (
                  <div className="absolute top-3 right-3 bg-amber-700 text-white text-xs font-bold px-2 py-0.5 rounded-sm">
                    Active
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Filter pills */}
          <div className="flex items-center gap-3 mb-8 flex-wrap">
            <button
              onClick={() => setActiveCategory("all")}
              className={`px-4 py-1.5 rounded-sm text-sm font-medium border transition-colors ${
                activeCategory === "all"
                  ? "bg-amber-700 text-white border-amber-700"
                  : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-1.5 rounded-sm text-sm font-medium border transition-colors ${
                  activeCategory === cat.id
                    ? "bg-amber-700 text-white border-amber-700"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                }`}
              >
                {cat.label}
              </button>
            ))}
            <span className="text-xs text-muted-foreground ml-auto">
              {filtered.length} listing{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Product grid */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((product) => (
              <Link
                key={product.id}
                to={`/market/${product.id}`}
                className="bg-card border border-border rounded-sm p-6 hover:border-amber-700/50 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">
                    {product.subcategory}
                  </span>
                  {product.available ? (
                    <span className="text-xs text-green-700 font-medium bg-green-50 border border-green-200 px-2 py-0.5 rounded-sm">
                      Available
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-sm">
                      Sold Out
                    </span>
                  )}
                </div>
                <h3
                  className="font-bold text-foreground text-lg mb-2 group-hover:text-amber-800 transition-colors"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {product.name}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-4 line-clamp-2">
                  {product.description}
                </p>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">{product.price}</span>
                  <span className="text-xs text-amber-700 font-medium group-hover:underline">
                    View details →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Call to action */}
      <section className="bg-card border-t border-border py-12 px-6 text-center">
        <p className="text-muted-foreground mb-2">Don't see what you're looking for?</p>
        <p className="text-foreground font-medium">
          Call Hank at{" "}
          <a href="tel:+12085550174" className="text-amber-700 hover:underline">
            (208) 555-0174
          </a>{" "}
          — mornings are best.
        </p>
      </section>
    </div>
  );
}

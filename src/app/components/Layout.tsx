import { useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { ShoppingCart, Menu, X } from "lucide-react";
import { useCart } from "../context/CartContext";

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/market", label: "Market" },
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/terms", label: "Terms & Conditions" },
];

export default function Layout() {
  const { items } = useCart();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const count = items.reduce((sum, i) => sum + i.qty, 0);

  return (
    <div
      className="min-h-screen bg-background text-foreground flex flex-col"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Nav */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">

          {/* Logo */}
          <Link
            to="/"
            className="font-bold text-foreground shrink-0"
            style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.1rem" }}
            onClick={() => setMenuOpen(false)}
          >
            Hank Dillard &amp; Sons
          </Link>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.slice(0, 2).map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                className={`text-sm font-medium transition-colors ${
                  location.pathname === to
                    ? "text-amber-700"
                    : "text-foreground/70 hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Right side: cart (always visible) + hamburger (mobile only) */}
          <div className="flex items-center gap-3">
            {/* Cart — always visible */}
            <Link
              to="/cart"
              className="relative flex items-center gap-1.5 px-3 py-2 rounded-sm border border-border bg-card hover:border-amber-700/50 transition-colors"
            >
              <ShoppingCart size={17} className="text-foreground/80" />
              {count > 0 ? (
                <span className="text-xs font-bold text-amber-700 tabular-nums">
                  {count}
                </span>
              ) : (
                <span className="hidden sm:inline text-xs text-muted-foreground">Cart</span>
              )}
              {count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-amber-700 text-white text-[10px] flex items-center justify-center font-bold leading-none">
                  {count}
                </span>
              )}
            </Link>

            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden flex items-center justify-center w-9 h-9 rounded-sm border border-border bg-card hover:border-amber-700/50 transition-colors"
              aria-label="Toggle menu"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile off-canvas drawer */}
        <div
          style={{
            maxHeight: menuOpen ? "400px" : "0",
            overflow: "hidden",
            transition: "max-height 0.3s cubic-bezier(0.4,0,0.2,1)",
          }}
          className="md:hidden border-t border-border bg-card"
        >
          <nav className="max-w-5xl mx-auto px-6 py-4 flex flex-col gap-1">
            {navLinks.map(({ to, label }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setMenuOpen(false)}
                className={`px-3 py-3 rounded-sm text-sm font-medium transition-colors ${
                  location.pathname === to
                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                    : "text-foreground/80 hover:bg-muted hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            ))}
            <Link
              to="/cart"
              onClick={() => setMenuOpen(false)}
              className="mt-2 px-3 py-3 rounded-sm text-sm font-medium text-foreground/80 hover:bg-muted hover:text-foreground transition-colors flex items-center gap-2"
            >
              <ShoppingCart size={15} />
              Cart {count > 0 && <span className="text-amber-700 font-bold">({count})</span>}
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-card py-8 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © 2025 Hank Dillard &amp; Sons Farm · Valley County, Idaho
          </p>
          <div className="flex gap-6 text-xs text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms &amp; Conditions</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

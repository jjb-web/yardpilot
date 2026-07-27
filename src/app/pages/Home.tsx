import { Link } from "react-router";

export default function Home() {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Hero — hay bales background */}
      <section
        className="relative min-h-screen flex flex-col justify-end bg-amber-900"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1732123280395-448294940895?w=1600&h=900&fit=crop&auto=format')",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
        <div className="relative z-10 max-w-3xl mx-auto w-full px-6 pb-20 pt-32">
          <p className="text-amber-300 text-sm uppercase tracking-widest mb-3">
            Est. 1987 · Valley County, Idaho
          </p>
          <h1
            className="text-white text-5xl md:text-7xl font-bold leading-tight mb-6"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Hank Dillard
            <br />
            <span className="text-amber-300">&amp; Sons Farm</span>
          </h1>
          <p className="text-stone-200 text-xl md:text-2xl max-w-xl leading-relaxed mb-10">
            Hay, cattle, and a handshake deal — the old-fashioned way.
          </p>
          <Link
            to="/market"
            className="inline-block px-8 py-4 bg-amber-700 text-white font-semibold rounded-sm hover:bg-amber-800 transition-colors"
            style={{ fontFamily: "'Playfair Display', serif", letterSpacing: "0.03em" }}
          >
            Browse the Market →
          </Link>
        </div>
      </section>

      {/* About */}
      <section className="bg-background py-20 px-6">
        <div className="max-w-2xl mx-auto">
          <h2
            className="text-3xl md:text-4xl font-bold text-foreground mb-6"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            About the Farm
          </h2>
          <div className="w-12 h-0.5 bg-accent mb-8" />
          <p className="text-lg leading-relaxed text-foreground/80 mb-5">
            I'm Hank Dillard — third-generation farmer right here in Valley County. My
            grandfather started this place in 1987 on 240 acres of river-bottom ground, and
            my two sons and I work it full-time today. We run a mixed operation: alfalfa and
            grass hay on the flats, and a small cow-calf herd up on the bench ground.
          </p>
          <p className="text-lg leading-relaxed text-foreground/80">
            We sell direct — no middlemen, no brokers. You come out, you see what you're
            buying, and we'll load it for you. Most of our customers have been coming back for
            ten years or more. That says something.
          </p>
        </div>
      </section>

      {/* Rates — cattle background */}
      <section
        className="relative bg-stone-800 py-24 px-6"
        style={{
          backgroundImage:
            "url('https://images.unsplash.com/photo-1641939193329-7071068dc40f?w=1600&h=700&fit=crop&auto=format')",
          backgroundSize: "cover",
          backgroundPosition: "center 40%",
        }}
      >
        <div className="absolute inset-0 bg-black/65" />
        <div className="relative z-10 max-w-3xl mx-auto">
          <h2
            className="text-white text-3xl md:text-4xl font-bold mb-2"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            What We Sell
          </h2>
          <p className="text-amber-300 text-sm uppercase tracking-widest mb-10">
            Current Rates · Summer 2025
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-black/40 border border-white/15 rounded-sm p-7 backdrop-blur-sm">
              <h3
                className="text-amber-300 text-xl font-bold mb-5"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Hay
              </h3>
              <ul className="space-y-4">
                {[
                  { label: "Alfalfa (small square)", price: "$14 / bale" },
                  { label: "Grass mix (small square)", price: "$10 / bale" },
                  { label: "Alfalfa (large round)", price: "$185 / bale" },
                  { label: "Grass mix (large round)", price: "$140 / bale" },
                ].map((item) => (
                  <li
                    key={item.label}
                    className="flex justify-between items-baseline border-b border-white/10 pb-3"
                  >
                    <span className="text-stone-200 text-sm">{item.label}</span>
                    <span className="text-white font-medium text-sm tabular-nums">{item.price}</span>
                  </li>
                ))}
              </ul>
              <p className="text-stone-400 text-xs mt-4 leading-relaxed">
                Volume discounts on 50+ bales. Delivery within 30 miles for $2/mile.
              </p>
            </div>

            <div className="bg-black/40 border border-white/15 rounded-sm p-7 backdrop-blur-sm">
              <h3
                className="text-amber-300 text-xl font-bold mb-5"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Livestock
              </h3>
              <ul className="space-y-4">
                {[
                  { label: "Weaned calves (steers)", price: "$3.20 / lb" },
                  { label: "Weaned calves (heifers)", price: "$2.85 / lb" },
                  { label: "Yearling steers", price: "$2.60 / lb" },
                  { label: "Bred cows", price: "Call for pricing" },
                ].map((item) => (
                  <li
                    key={item.label}
                    className="flex justify-between items-baseline border-b border-white/10 pb-3"
                  >
                    <span className="text-stone-200 text-sm">{item.label}</span>
                    <span className="text-white font-medium text-sm tabular-nums">{item.price}</span>
                  </li>
                ))}
              </ul>
              <p className="text-stone-400 text-xs mt-4 leading-relaxed">
                All calves are vet-checked, vaccinated, and weaned a minimum of 45 days.
              </p>
            </div>
          </div>

          <div className="mt-10">
            <Link
              to="/market"
              className="inline-block px-8 py-4 bg-amber-700 text-white font-semibold rounded-sm hover:bg-amber-800 transition-colors"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              View Full Market →
            </Link>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="bg-background py-16 px-6">
        <div className="max-w-2xl mx-auto">
          <h2
            className="text-2xl font-bold text-foreground mb-6"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            Get in Touch
          </h2>
          <div className="w-8 h-0.5 bg-accent mb-8" />
          <div className="grid sm:grid-cols-2 gap-6 text-foreground/80">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Phone</p>
              <p className="text-lg font-medium text-foreground">(208) 555-0174</p>
              <p className="text-sm mt-1">Mornings best — 7 to 9 AM</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">Location</p>
              <p className="text-lg font-medium text-foreground">4812 River Bottom Rd</p>
              <p className="text-sm mt-1">Valley County, Idaho 83638</p>
            </div>
          </div>
          <p className="mt-8 text-sm text-muted-foreground">
            No website forms, no email list. Just call or stop by. We're out in the field most
            days but the phone comes with us.
          </p>
        </div>
      </section>
    </div>
  );
}

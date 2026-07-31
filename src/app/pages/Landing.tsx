import { useState } from "react";
import { Link } from "react-router";
import { CheckCircle, Zap, Camera, Users, FileText, Bell, Smartphone, ChevronRight, } from "lucide-react";

const problems = [
  "Creating quotes manually for every job",
  "Re-entering the same customer information repeatedly",
  "Chasing leads that go cold before you follow up",
  "Losing jobs because estimates took too long",
  "Managing everything across spreadsheets and text messages",
];

const features = [
  { icon: Zap, title: "Flexible Estimate Builder", desc: "Create clear estimates with multiple jobs, labor, materials, and custom units." },
  { icon: Camera, title: "Property Photos", desc: "Keep property and job photos with the customer record and work instructions." },
  { icon: Users, title: "Customer CRM", desc: "Track every lead, estimate, and relationship in one place." },
  { icon: FileText, title: "Proposal Builder", desc: "Send professional PDF proposals directly from the app." },
  { icon: Bell, title: "Follow-Up Automation", desc: "Never let a lead go cold — automated reminders keep you on top." },
  { icon: Smartphone, title: "Mobile Field Access", desc: "Built for contractors. Works on your phone, on the job site." },
];

const incentives = [
  { label: "Founding Member Pricing", desc: "Lock in the lowest rate we'll ever offer." },
  { label: "Free Beta Access", desc: "Use the full product before anyone else." },
  { label: "Direct Influence", desc: "Your feedback shapes what gets built first." },
  { label: "Lifetime Discount", desc: "Founding members keep their rate forever." },
];

// Inline UI mockup — no images needed
function DashboardMockup() {
  return (
    <div className="bg-white rounded-xl border border-green-100 shadow-2xl shadow-green-900/10 overflow-hidden w-full max-w-md mx-auto">
      {/* Mockup header bar */}
      <div className="bg-green-700 px-4 py-3 flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
        <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
        <span className="ml-3 text-green-200 text-xs font-medium">YardPilotUSA — Estimate Builder</span>
      </div>
      {/* Mockup body */}
      <div className="p-4 space-y-3 bg-gray-50">
        <div className="bg-white rounded-lg p-3 border border-gray-100">
          <p className="text-xs text-gray-400 mb-1">Project</p>
          <p className="text-sm font-semibold text-gray-800">Hartwell Backyard Redesign</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[["Sq Footage", "2,400 ft²"], ["Labor Rate", "$65/hr"], ["Labor Hours", "28 hrs"], ["Materials", "$1,800"]].map(([k, v]) => (
            <div key={k} className="bg-white rounded-lg p-3 border border-gray-100">
              <p className="text-xs text-gray-400">{k}</p>
              <p className="text-sm font-bold text-gray-800">{v}</p>
            </div>
          ))}
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-xs text-green-700 font-medium mb-1">Estimate total</p>
          <p className="text-sm text-gray-700 leading-snug">Materials, labor, and multiple job sections combine into one professional estimate: <strong>$4,480</strong>.</p>
        </div>
        <div className="bg-green-700 text-white text-center text-xs font-semibold py-2.5 rounded-lg">
          Create Estimate →
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  function handleSubscribe(e: React.FormEvent) {
    e.preventDefault();
    setSubscribed(true);
  }

  return (
    <div className="min-h-screen bg-white text-gray-900" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* Nav */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-green-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg overflow-hidden">
              <img
                src="/yardpilot-logo.png"
                alt="YardPilotUSA logo"
                className="w-full h-full object-contain"
              />
            </div>
            <span className="font-bold text-gray-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>YardPilotUSA</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Sign In
            </Link>
            <Link
              to="/login"
              className="px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 transition-colors"
            >
              Get Early Access
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 py-20 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-green-200 mb-6">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Now accepting beta testers
            </div>
            <h1
              className="text-4xl lg:text-5xl xl:text-6xl font-extrabold text-gray-900 leading-tight mb-5"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Create Landscaping Estimates in{" "}
              <span className="text-green-700">Minutes,</span> Not Hours
            </h1>
            <p className="text-lg text-gray-500 leading-relaxed mb-8 max-w-lg">
              Business software built specifically for landscapers. Create estimates, organize jobs, schedule crews, invoice customers, and collect payments in one place.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/login"
                className="px-6 py-3.5 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition-colors text-center flex items-center justify-center gap-2"
              >
                Join the Beta Waitlist <ChevronRight size={16} />
              </Link>
              <a
                href="#survey"
                className="px-6 py-3.5 border border-green-200 text-green-700 font-semibold rounded-lg hover:bg-green-50 transition-colors text-center"
              >
                Take the 3-Minute Survey
              </a>
            </div>
          </div>
          <div>
            <DashboardMockup />
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="bg-gray-950 py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-green-400 text-sm font-semibold uppercase tracking-widest mb-3 text-center">Sound familiar?</p>
          <h2
            className="text-3xl lg:text-4xl font-extrabold text-white text-center mb-12"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Still Doing Estimates the Hard Way?
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {problems.map((p) => (
              <div key={p} className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-5">
                <span className="text-red-400 mt-0.5 text-lg leading-none">✕</span>
                <p className="text-gray-300 text-sm leading-relaxed">{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solution */}
      <section className="bg-green-700 py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-green-200 text-sm font-semibold uppercase tracking-widest mb-3">The solution</p>
          <h2
            className="text-3xl lg:text-4xl font-extrabold text-white mb-4"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Meet YardPilotUSA
          </h2>
          <p className="text-green-100 text-lg mb-10 max-w-xl mx-auto">
            A straightforward estimating and job-management platform designed specifically for landscaping businesses.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 text-left max-w-3xl mx-auto">
            {["Generate estimates in minutes", "Upload property photos", "Track leads and proposals", "Automate follow-ups", "Manage customers in one place", "Works on mobile, on the job"].map((item) => (
              <div key={item} className="flex items-center gap-3 bg-white/10 rounded-xl px-5 py-4">
                <CheckCircle size={18} className="text-green-300 shrink-0" />
                <span className="text-white text-sm font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-green-700 text-sm font-semibold uppercase tracking-widest mb-3">Features</p>
            <h2
              className="text-3xl lg:text-4xl font-extrabold text-gray-900"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Everything in One Place
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="p-6 rounded-xl border border-green-100 bg-green-50/40 hover:border-green-300 hover:shadow-md transition-all group"
              >
                <div className="w-10 h-10 bg-green-700 rounded-lg flex items-center justify-center mb-4 group-hover:bg-green-800 transition-colors">
                  <Icon size={20} className="text-white" />
                </div>
                <h3 className="font-bold text-gray-900 mb-1.5">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* App mockup strip */}
      <section className="bg-gray-50 py-16 px-6 overflow-hidden">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-sm font-semibold text-gray-400 uppercase tracking-widest mb-8">
            Concept Preview
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              {
                title: "Dashboard",
                rows: [["Active Projects", "12"], ["Open Estimates", "4"], ["This Month Revenue", "$28,400"], ["Avg. Estimate Time", "4 min"]],
              },
              {
                title: "Customer CRM",
                rows: [["Total Contacts", "84"], ["Leads This Week", "7"], ["Follow-ups Due", "3"], ["Closed Rate", "68%"]],
              },
              {
                title: "Analytics",
                rows: [["Best Job Type", "Hardscaping"], ["Peak Season", "April–June"], ["Avg. Job Value", "$3,200"], ["Repeat Clients", "52%"]],
              },
            ].map((screen) => (
              <div key={screen.title} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-green-700 px-4 py-2.5">
                  <p className="text-white text-xs font-semibold">{screen.title}</p>
                </div>
                <div className="p-4 space-y-2">
                  {screen.rows.map(([k, v]) => (
                    <div key={k} className="flex justify-between items-center py-1.5 border-b border-gray-50">
                      <span className="text-xs text-gray-500">{k}</span>
                      <span className="text-xs font-bold text-gray-800">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Founder */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-2xl mx-auto">
          <div className="border border-green-100 rounded-2xl p-8 bg-green-50/30">
            <div className="w-12 h-12 bg-green-700 rounded-full flex items-center justify-center mb-5 text-white font-bold text-lg" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              J
            </div>
            <p className="text-gray-700 leading-relaxed text-lg mb-4">
              Hi — I'm building YardPilotUSA after spending time with landscaping crews and seeing firsthand how much time goes into creating estimates and chasing down customers.
            </p>
            <p className="text-gray-700 leading-relaxed mb-6">
              Before we write another line of code, I want to hear from real landscapers. What's actually slowing you down? What would make the biggest difference? Your input shapes what we build first."
            </p>
            <div>
              <p className="font-semibold text-gray-900">William B.</p>
              <p className="text-sm text-gray-500">Co-Founder, YardPilotUSA</p>
            </div>
          </div>
        </div>
      </section>

      {/* Survey CTA */}
      <section id="survey" className="bg-green-700 py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2
            className="text-3xl lg:text-4xl font-extrabold text-white mb-4"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Help Shape the Future of Landscaping Software
          </h2>
          <p className="text-green-100 text-lg mb-10">
            Take our 3-minute survey and help determine what features get built first.
          </p>
          <a
            href="https://forms.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-10 py-4 bg-white text-green-700 font-bold text-lg rounded-xl hover:bg-green-50 transition-colors shadow-lg"
          >
            Take the Survey →
          </a>
          <p className="text-green-200 text-sm mt-4">Takes 3 minutes · No sign-up required</p>
        </div>
      </section>

      {/* Early Access Incentives */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-green-700 text-sm font-semibold uppercase tracking-widest mb-3">Early access</p>
            <h2
              className="text-3xl font-extrabold text-gray-900"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Join Early, Benefit Forever
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {incentives.map(({ label, desc }) => (
              <div key={label} className="p-5 rounded-xl border border-green-100 bg-green-50/40 text-center">
                <div className="text-green-700 text-2xl mb-3">✦</div>
                <p className="font-bold text-gray-900 mb-1 text-sm">{label}</p>
                <p className="text-gray-500 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="bg-gray-950 py-16 px-6">
        <div className="max-w-md mx-auto text-center">
          <h3
            className="text-2xl font-extrabold text-white mb-2"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Stay in the Loop
          </h3>
          <p className="text-gray-400 text-sm mb-6">
            Get notified when we launch. No spam — just real updates.
          </p>
          {subscribed ? (
            <div className="bg-green-900/40 border border-green-700 rounded-xl p-5">
              <p className="text-green-300 font-semibold">You're on the list ✓</p>
              <p className="text-gray-400 text-sm mt-1">We'll reach out when beta access opens.</p>
            </div>
          ) : (
            <form onSubmit={handleSubscribe} className="flex gap-2">
              <input
                required
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-gray-500 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 transition"
              />
              <button
                type="submit"
                className="px-5 py-3 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-600 transition-colors text-sm shrink-0"
              >
                Subscribe
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-950 border-t border-white/5 py-6 px-6 text-center">
        <p className="text-gray-600 text-xs">
          © 2025 YardPilotUSA · Built for landscapers · All rights reserved
        </p>
      </footer>
    </div>
  );
}

export default function Terms() {
  return (
    <div className="bg-background py-16 px-6 min-h-screen" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-2xl mx-auto">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Legal</p>
        <h1 className="text-3xl font-bold text-foreground mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
          Terms &amp; Conditions
        </h1>
        <p className="text-muted-foreground text-sm mb-10">Last updated: January 1, 2025</p>

        {[
          {
            title: "Order Requests",
            body: "Submitting an order through this website constitutes a request only — not a confirmed purchase. All orders are subject to availability and must be confirmed by Hank Dillard or a representative via phone before they are considered final.",
          },
          {
            title: "Pricing",
            body: "Prices listed on this website are current estimates and may change without notice, particularly for livestock priced by live weight. Final pricing is confirmed at time of sale. Items listed as 'Call for pricing' require a phone conversation before any transaction.",
          },
          {
            title: "Payment",
            body: "Payment is due at time of pickup or delivery unless otherwise arranged. We accept cash, check, and bank transfer. We do not currently accept credit or debit cards.",
          },
          {
            title: "Livestock Sales",
            body: "All livestock are sold as-is. Buyer is responsible for arranging transportation unless delivery is agreed upon. Risk of loss passes to the buyer upon pickup or delivery. Vet records are provided upon request.",
          },
          {
            title: "Hay Sales",
            body: "Hay is sold by the bale. Quality descriptions are made in good faith but may vary by cutting and storage conditions. Buyer assumes responsibility for inspecting hay before purchase when possible.",
          },
          {
            title: "Farm Services",
            body: "Custom baling, hauling, and other services are subject to scheduling availability and weather conditions. We reserve the right to reschedule services due to equipment issues or field conditions.",
          },
          {
            title: "Limitation of Liability",
            body: "Hank Dillard & Sons Farm's liability for any transaction shall not exceed the purchase price of the goods or services in question. We are not responsible for consequential or incidental damages arising from a purchase.",
          },
          {
            title: "Governing Law",
            body: "These terms are governed by the laws of the State of Idaho. Any disputes shall be resolved in Valley County, Idaho.",
          },
        ].map((section) => (
          <div key={section.title} className="mb-8">
            <h2 className="text-lg font-bold text-foreground mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
              {section.title}
            </h2>
            <div className="w-8 h-px bg-accent mb-3" />
            <p className="text-foreground/80 leading-relaxed">{section.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

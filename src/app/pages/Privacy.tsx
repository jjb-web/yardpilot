export default function Privacy() {
  return (
    <div className="bg-background py-16 px-6 min-h-screen" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-2xl mx-auto prose-sm">
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Legal</p>
        <h1 className="text-3xl font-bold text-foreground mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
          Privacy Policy
        </h1>
        <p className="text-muted-foreground text-sm mb-10">Last updated: January 1, 2025</p>

        {[
          {
            title: "Information We Collect",
            body: "When you submit an order request or contact us through this website, we collect the name, phone number, email address, and mailing address you provide. We do not collect payment card information through this site — all payment is arranged directly by phone or in person.",
          },
          {
            title: "How We Use Your Information",
            body: "We use your contact information solely to respond to your order requests and arrange pickup or delivery. We do not sell, rent, or share your personal information with third parties for marketing purposes.",
          },
          {
            title: "Data Retention",
            body: "We retain order request information for up to 12 months for record-keeping purposes, after which it is deleted. You may request deletion of your information at any time by contacting us.",
          },
          {
            title: "Cookies",
            body: "This website does not use tracking cookies or analytics software. No third-party advertising scripts are loaded.",
          },
          {
            title: "Third-Party Services",
            body: "This site may load images from Unsplash's content delivery network. No personal data is shared with Unsplash.",
          },
          {
            title: "Contact",
            body: "For any privacy-related questions, call Hank at (208) 555-0174 or write to: Hank Dillard & Sons Farm, 4812 River Bottom Rd, Valley County, Idaho 83638.",
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

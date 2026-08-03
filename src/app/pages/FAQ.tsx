import { Link } from "react-router";
import { ArrowLeft, HelpCircle } from "lucide-react";

const questions = [
  {
    question: "When does an estimate become a job?",
    answer:
      "An estimate starts as Draft. Sharing marks it Sent. When the client accepts it, YardPilot automatically moves it into Jobs. Declined estimates stay in the estimate record.",
  },
  {
    question: "What happens when a job is completed?",
    answer:
      "The job moves to Past Jobs, its scheduled job event is removed, and a final invoice snapshot is created from the accepted estimate.",
  },
  {
    question: "Can one customer have multiple properties?",
    answer:
      "Yes. A contact can have any number of properties, and each property can keep its own address, notes, photos, estimates, and job history.",
  },
  {
    question: "What is the difference between a company and a workgroup?",
    answer:
      "A company name is uniquely claimed across YardPilot. Workgroups use the same shared roles and dashboard tools, but different users may create workgroups with the same display name.",
  },
  {
    question: "Does YardPilot automatically email team invitations?",
    answer:
      "No. YardPilot creates a secure code and link. Copy one and send it to the invited person yourself.",
  },
];

export default function FAQ() {
  return (
    <div className="min-h-screen bg-[#eef1ef] px-4 py-10 text-gray-900">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} /> Back to YardPilot
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <HelpCircle size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Frequently Asked Questions</h1>
              <p className="mt-1 text-sm text-gray-500">
                Quick answers about estimates, jobs, properties, and team workspaces.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {questions.map((item) => (
              <section
                key={item.question}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-5"
              >
                <h2 className="font-bold text-slate-900">{item.question}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {item.answer}
                </p>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

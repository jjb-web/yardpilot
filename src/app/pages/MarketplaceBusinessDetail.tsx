import { useEffect, useState } from "react";
import { ArrowLeft, BriefcaseBusiness, Globe2, Mail, MapPin, Phone, ShieldCheck, Star, Users } from "lucide-react";
import { Link, useParams } from "react-router";
import { supabase } from "../lib/supabase";
import type { MarketplaceBusiness, MarketplaceOpening, MarketplaceReview } from "../data/marketplace";

export default function MarketplaceBusinessDetail() {
  const { workspaceId } = useParams();
  const [business, setBusiness] = useState<MarketplaceBusiness | null>(null);
  const [openings, setOpenings] = useState<MarketplaceOpening[]>([]);
  const [reviews, setReviews] = useState<MarketplaceReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      if (!workspaceId) return;
      setLoading(true);
      const [
        { data: profile, error: profileError },
        { data: openingRows, error: openingError },
        { data: reviewRows, error: reviewError },
      ] = await Promise.all([
        supabase.from("marketplace_business_profiles").select("*").eq("workspace_id", workspaceId).eq("published", true).maybeSingle(),
        supabase.from("marketplace_job_openings").select("*").eq("workspace_id", workspaceId).eq("active", true).order("created_at", { ascending: false }),
        supabase.rpc("get_public_marketplace_reviews", { requested_workspace_id: workspaceId }),
      ]);

      if (!active) return;
      if (profileError || openingError || reviewError) {
        setError(profileError?.message || openingError?.message || reviewError?.message || "Could not load this business.");
      } else {
        setBusiness(profile as MarketplaceBusiness | null);
        setOpenings(
          ((openingRows ?? []) as Record<string, unknown>[]).map((row) => ({
            ...(row as unknown as MarketplaceOpening),
            business_name: String(profile?.display_name ?? ""),
            business_headline: String(profile?.headline ?? ""),
          })),
        );
        setReviews((reviewRows ?? []) as MarketplaceReview[]);
      }
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [workspaceId]);

  if (loading) return <div className="p-8 text-sm text-slate-500">Loading company…</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-7">
      <Link to="/client/market" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
        <ArrowLeft size={16} /> Back to market
      </Link>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!business && !error && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">This company is not currently published.</div>}

      {business && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-3">
                  <BriefcaseBusiness size={24} className="text-slate-600" />
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{business.display_name}</h1>
                  {business.verification_status === "verified_active_registration" && <span title="Public business registration verified" className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800"><ShieldCheck size={13} /> Registration verified</span>}
                </div>
                {business.headline && <p className="mt-2 text-base text-slate-600">{business.headline}</p>}
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {business.accepting_client_work && <span className="rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-800">Accepting projects</span>}
                  {business.hiring && <span className="rounded-full bg-blue-100 px-3 py-1 font-semibold text-blue-800">Hiring</span>}
                </div>
                {business.verification_status === "verified_active_registration" && (
                  <p className="mt-3 text-xs text-slate-500">Verified against the stated public registration record{business.legal_business_name ? ` for ${business.legal_business_name}` : ""}{business.formation_state ? ` in ${business.formation_state}` : ""}. This does not verify work quality, insurance, licensing, tax compliance, or suitability.</p>
                )}
              </div>
              {business.accepting_client_work && (
                <Link to="/client/requests" className="rounded-lg bg-slate-900 px-4 py-2.5 text-center text-sm font-semibold text-white">
                  Post a project for bids
                </Link>
              )}
            </div>

            {(business.city || business.state) && (
              <p className="mt-5 flex items-center gap-2 text-sm text-slate-500">
                <MapPin size={16} /> {[business.city, business.state, business.postal_code].filter(Boolean).join(", ")} · service radius {business.service_radius_miles} miles
              </p>
            )}

            {business.description && <p className="mt-5 whitespace-pre-line text-sm leading-7 text-slate-700">{business.description}</p>}
            {business.availability_note && <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700"><strong>Availability:</strong> {business.availability_note}</div>}

            <div className="mt-5 flex flex-wrap gap-2">
              {business.services.map((service) => <span key={service} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600">{service}</span>)}
            </div>

            <div className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
              {business.public_phone && <a href={`tel:${business.public_phone}`} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-slate-700"><Phone size={16} />{business.public_phone}</a>}
              {business.public_email && <a href={`mailto:${business.public_email}`} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-slate-700"><Mail size={16} />{business.public_email}</a>}
              {business.website_url && <a href={business.website_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-slate-700"><Globe2 size={16} />Website</a>}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3"><Star size={20} className="text-amber-500" /><h2 className="text-lg font-bold text-slate-900 dark:text-white">Verified YardPilotUSA reviews</h2></div>
              {reviews.length > 0 && <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{(reviews.reduce((sum, review) => sum + Number(review.rating), 0) / reviews.length).toFixed(1)} / 5 · {reviews.length}</p>}
            </div>
            <p className="mt-2 text-xs text-slate-500">Only clients connected to a paid or completed YardPilotUSA marketplace project can submit these reviews. Reviews are moderated for abuse, not for whether they are positive or negative.</p>
            <div className="mt-4 space-y-3">
              {reviews.map((review) => (
                <article key={review.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex items-center gap-1 text-amber-500">{Array.from({ length: 5 }, (_, index) => <Star key={index} size={15} className={index < review.rating ? "fill-current" : "text-slate-300"} />)}</div>
                  {review.title && <h3 className="mt-2 font-bold text-slate-900 dark:text-white">{review.title}</h3>}
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600 dark:text-slate-300">{review.body}</p>
                  <p className="mt-2 text-xs text-slate-400">Verified YardPilotUSA project · {new Date(review.created_at).toLocaleDateString()}</p>
                  {review.business_response && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200"><strong>Business response:</strong> {review.business_response}</div>}
                </article>
              ))}
              {reviews.length === 0 && <p className="text-sm text-slate-500">No published verified-project reviews yet.</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <Users size={20} />
              <h2 className="text-lg font-bold text-slate-900">Open positions</h2>
            </div>
            <div className="mt-4 space-y-3">
              {openings.map((opening) => (
                <article key={opening.id} className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-bold text-slate-900">{opening.title}</h3>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{opening.employment_type.replaceAll("_", " ")}</p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{opening.description}</p>
                </article>
              ))}
              {openings.length === 0 && <p className="text-sm text-slate-500">No active openings are published right now.</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

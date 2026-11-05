import type { Rating, RatingLevel } from "@/lib/analysis";

const LEVEL_STYLES: Record<RatingLevel, string> = {
  none: "border-slate-500 bg-slate-100 text-slate-900",
  low: "border-green-700 bg-green-50 text-green-950",
  medium: "border-amber-600 bg-amber-50 text-amber-950",
  high: "border-red-700 bg-red-50 text-red-950",
};

export function RatingCard({ rating, threshold }: { rating: Rating; threshold: number }) {
  return (
    <section
      aria-labelledby="rating-heading"
      aria-live="polite"
      className={`rounded-xl border-l-8 p-5 shadow-sm ${LEVEL_STYLES[rating.level]}`}
      data-testid="rating-card"
    >
      <h2 id="rating-heading" className="text-base font-semibold uppercase tracking-wide">
        Crossing distraction rating
      </h2>
      {rating.level === "none" ? (
        <p className="mt-1 text-3xl font-bold sm:text-4xl" data-testid="rating-label">
          No pedestrians detected
        </p>
      ) : (
        <>
          <p className="mt-1 text-4xl font-bold sm:text-5xl" data-testid="rating-label">
            {rating.label}
          </p>
          <p className="mt-2 text-xl font-medium sm:text-2xl" data-testid="rating-summary">
            {rating.summary}
          </p>
        </>
      )}
      <p className="mt-3 text-sm">Counting detections at {threshold}% confidence or higher.</p>
      <p className="mt-1 text-base font-medium" data-testid="honesty-note">
        Results are model estimates and may be wrong when phones are small or hidden. This rating is not a measure of
        real-world safety.
      </p>
    </section>
  );
}

import { CLASS_INFO, PERSON_CLASSES, boxStyleFor } from "@/config/classes";
import type { ClassCounts, Rating } from "@/lib/analysis";

export function CountsTable({ counts, rating }: { counts: ClassCounts; rating: Rating }) {
  return (
    <section aria-labelledby="counts-heading">
      <h2 id="counts-heading" className="text-xl font-semibold text-slate-900">
        Pedestrian counts
      </h2>
      <table className="mt-2 w-full border-collapse text-left text-lg" data-testid="counts-table">
        <thead>
          <tr className="border-b-2 border-slate-300 text-sm uppercase tracking-wide text-slate-600">
            <th scope="col" className="py-2">Class</th>
            <th scope="col" className="py-2 text-right">Count</th>
          </tr>
        </thead>
        <tbody>
          {PERSON_CLASSES.map((c) => (
            <tr key={c} className="border-b border-slate-200">
              <th scope="row" className="py-2 font-normal">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block h-4 w-4 shrink-0 rounded-sm"
                    style={{ backgroundColor: boxStyleFor(c).stroke }}
                  />
                  <span>
                    <code className="font-mono font-semibold text-slate-900">{c}</code>
                    <span className="block text-sm text-slate-600">{CLASS_INFO[c].description}</span>
                  </span>
                </span>
              </th>
              <td className="py-2 text-right text-2xl font-bold tabular-nums" data-testid={`count-${c}`}>
                {counts[c]}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-b border-slate-200">
            <th scope="row" className="py-2">Phone users</th>
            <td className="py-2 text-right text-2xl font-bold tabular-nums" data-testid="count-phone">
              {rating.phoneUsers}
            </td>
          </tr>
          <tr>
            <th scope="row" className="py-2">Total people</th>
            <td className="py-2 text-right text-2xl font-bold tabular-nums" data-testid="count-total">
              {rating.totalPeople}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

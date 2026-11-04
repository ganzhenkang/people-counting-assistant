import { PeopleCounter } from "@/components/PeopleCounter";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">People Counting Assistant (Team 5)</h1>
        <p className="mt-2 text-lg text-slate-700 sm:text-2xl">
          Detect pedestrians, their direction and phone use at zebra crossings
        </p>
      </header>
      <PeopleCounter />
      <footer className="mt-10 border-t border-slate-200 pt-4 text-sm text-slate-600">
        Detections come from a Roboflow object detection model trained by Team 5. Results can be wrong; use the
        &ldquo;Flag wrong result&rdquo; button to record mistakes.
      </footer>
    </main>
  );
}

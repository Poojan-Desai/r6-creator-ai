export default function ProjectLoading() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl animate-pulse px-5 py-12 sm:px-7 lg:px-10">
      <div className="h-12 w-56 rounded-xl bg-white/5" />
      <div className="mt-16 h-12 max-w-lg rounded-xl bg-white/5" />
      <div className="mt-10 grid gap-7 xl:grid-cols-[1.45fr_0.55fr]">
        <div className="aspect-video rounded-3xl bg-white/5" />
        <div className="h-80 rounded-3xl bg-white/5" />
      </div>
    </main>
  );
}

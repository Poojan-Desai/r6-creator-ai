import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6 py-16 text-center">
      <div>
        <SearchX
          className="mx-auto text-[#b8ff2c]"
          aria-hidden="true"
          size={42}
        />
        <p className="section-kicker mt-6">Project not found</p>
        <h1 className="font-display mt-2 text-5xl font-extrabold text-white uppercase">
          Nothing saved here
        </h1>
        <p className="mx-auto mt-4 max-w-lg leading-7 text-slate-500">
          This project may have been deleted, or the link may be incomplete.
          Your other saved projects are unchanged.
        </p>
        <Link href="/" className="primary-button mt-7">
          <ArrowLeft aria-hidden="true" size={16} /> Back to projects
        </Link>
      </div>
    </main>
  );
}

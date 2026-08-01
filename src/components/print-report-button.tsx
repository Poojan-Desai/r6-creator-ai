"use client";

import { Printer } from "lucide-react";

export function PrintReportButton() {
  return (
    <button
      type="button"
      className="secondary-button print:hidden"
      onClick={() => window.print()}
    >
      <Printer size={15} /> Print report
    </button>
  );
}

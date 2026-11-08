'use client';

import { useState } from 'react';
import type { ExportInput } from '@/lib/csv';

interface CsvButtonProps {
  /** Builds the export input from the current view (called on click). */
  getInput: () => ExportInput;
  disabled?: boolean;
}

/** Quiet text button that downloads the current view as CSV, built in the browser. */
export default function CsvButton({ getInput, disabled }: CsvButtonProps) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      // The serializer is only loaded when someone exports
      const { buildExportCsv, exportFileName } = await import('@/lib/csv');
      const input = getInput();
      const blob = new Blob([buildExportCsv(input)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFileName(input);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="share-btn csv-btn"
      onClick={download}
      disabled={disabled || busy}
      title="Download statistics and daily values as CSV"
    >
      <span className="csv-btn-prefix">Export </span>CSV
    </button>
  );
}

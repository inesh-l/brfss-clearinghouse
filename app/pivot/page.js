"use client";

import { useRef, useState } from "react";
import Papa from "papaparse";
import PivotTableUI from "react-pivottable/PivotTableUI";
import "react-pivottable/pivottable.css";
import NavTabs from "../components/NavTabs";

const DATA_DICT_URLS = {
  2016: new URL("../datadicts/2016_datadict.csv", import.meta.url).href,
  2017: new URL("../datadicts/2017_datadict.csv", import.meta.url).href,
  2018: new URL("../datadicts/2018_datadict.csv", import.meta.url).href,
  2019: new URL("../datadicts/2019_datadict.csv", import.meta.url).href,
  2020: new URL("../datadicts/2020_datadict.csv", import.meta.url).href,
  2021: new URL("../datadicts/2021_datadict.csv", import.meta.url).href,
  2022: new URL("../datadicts/2022_datadict.csv", import.meta.url).href,
  2023: new URL("../datadicts/2023_datadict.csv", import.meta.url).href,
};

export default function PivotPage() {
  const [data, setData] = useState([]);
  const [pivotState, setPivotState] = useState({});
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Upload a CSV to start.");
  const [rowCount, setRowCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchYear, setSearchYear] = useState("2023");
  const [dictResult, setDictResult] = useState(null);
  const [dictError, setDictError] = useState("");
  const [dictLoading, setDictLoading] = useState(false);
  const dictCacheRef = useRef(new Map());

  const handleFile = (file) => {
    setError("");
    if (!file) {
      setStatus("Upload a CSV to start.");
      setRowCount(0);
      setData([]);
      setPivotState({});
      return;
    }

    setStatus("Reading CSV...");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (results) => {
        const rows = results?.data || [];
        if (!rows.length) {
          setError("CSV had no rows.");
          setStatus("Upload a CSV to start.");
          setData([]);
          setPivotState({});
          setRowCount(0);
          return;
        }
        setData(rows);
        setPivotState((prev) => ({ ...prev, data: rows }));
        setRowCount(rows.length);
        setStatus(`Loaded ${rows.length.toLocaleString()} rows. Drag fields to pivot.`);
      },
      error: (err) => {
        console.error(err);
        setError("Could not parse that CSV.");
        setStatus("Upload a CSV to start.");
        setData([]);
        setPivotState({});
        setRowCount(0);
      },
    });
  };

  const lookupDict = async () => {
    setDictError("");
    setDictResult(null);
    const term = searchTerm.trim();
    if (!term) {
      setDictError("Enter a variable name to search.");
      return;
    }
    const year = Number(searchYear);
    const url = DATA_DICT_URLS[year];
    if (!url) {
      setDictError("Invalid year selected.");
      return;
    }
    setDictLoading(true);
    try {
      let parsed = dictCacheRef.current.get(year);
      if (!parsed) {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Could not load data dictionary.");
        const text = await res.text();
        parsed = Papa.parse(text, { header: true, skipEmptyLines: true }).data;
        dictCacheRef.current.set(year, parsed);
      }
      const lowerTerm = term.toLowerCase();
      const match =
        parsed.find(
          (row) => (row.column_name || "").toLowerCase() === lowerTerm
        ) ||
        parsed.find(
          (row) => (row.column_name || "").toLowerCase().includes(lowerTerm)
        );
      if (match) {
        setDictResult({ year, ...match });
      } else {
        setDictError("No match found in that year's dictionary.");
      }
    } catch (err) {
      console.error(err);
      setDictError(err.message || "Lookup failed.");
    } finally {
      setDictLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-stone-50 to-amber-100 text-stone-900">
      <main className="mx-auto flex max-w-6xl flex-col gap-6 py-10 px-6">
        <NavTabs />
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-amber-700">Ohio BRFSS</p>
            <h1 className="text-3xl font-semibold leading-tight text-stone-900">Pivot</h1>
            <p className="text-sm text-stone-600">
              Upload a CSV and explore it with react-pivottable directly in your browser.
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
            <label className="flex cursor-pointer items-center gap-3 rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-amber-500">
              Upload CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => handleFile(e.target.files?.[0])}
                className="hidden"
              />
            </label>
            <span className="rounded-full border border-amber-200 bg-white/80 px-4 py-2 text-xs font-semibold text-stone-700 shadow">
              {status}
            </span>
          </div>
        </header>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <section className="rounded-2xl border border-amber-200 bg-white/80 p-4 shadow-lg shadow-amber-100/60">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-amber-700">
                Data dictionary lookup
              </p>
              <h3 className="text-lg font-semibold text-stone-900">
                Find a variable by year
              </h3>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-stone-600">Variable name</label>
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="e.g., GENHLTH"
                  className="w-52 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-stone-600">Year</label>
                <select
                  value={searchYear}
                  onChange={(e) => setSearchYear(e.target.value)}
                  className="w-28 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"
                >
                  {Object.keys(DATA_DICT_URLS)
                    .sort()
                    .map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                </select>
              </div>
              <button
                onClick={lookupDict}
                disabled={dictLoading}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-amber-200 disabled:text-stone-500"
              >
                {dictLoading ? "Searching..." : "Search"}
              </button>
            </div>
          </div>
          {dictError && (
            <p className="mt-2 text-sm text-rose-700">{dictError}</p>
          )}
          {dictResult && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-white p-3 text-sm text-stone-800">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-700">
                {dictResult.year} · {dictResult.column_name}
              </p>
              <p className="mt-1 font-semibold">{dictResult.description}</p>
              <p className="mt-1 text-xs text-stone-600">
                DuckDB type: {dictResult.column_type || "n/a"}
              </p>
              {dictResult.possible_values && (
                <pre className="mt-2 whitespace-pre-wrap rounded border border-amber-100 bg-amber-50 p-2 text-xs text-stone-800">
{dictResult.possible_values}
                </pre>
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-amber-200 bg-white p-4 shadow-lg shadow-amber-100/60">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-stone-900">Pivot</h3>
            <p className="text-xs text-stone-600">
              Drag fields between rows/columns; aggregators and renderers are built-in.
            </p>
          </div>
          <div className="min-h-[420px] overflow-auto rounded-xl border border-amber-100 bg-white p-3">
            {rowCount ? (
              <PivotTableUI
                data={data}
                onChange={(s) => setPivotState(s)}
                {...pivotState}
              />
            ) : (
              <p className="text-sm text-stone-500">
                Upload a CSV to start. All processing stays in your browser.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

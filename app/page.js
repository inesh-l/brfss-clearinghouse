"use client";

import { useEffect, useRef, useState } from "react";
import NavTabs from "./components/NavTabs";
import { initDuckDB, loadCsv, runDuckQuery } from "./lib/duckdbClient";
import { draftSql } from "./lib/sqlexplorerGeminiClient";
import { SAMPLE_QUERIES } from "./lib/sampleQueries";
import SampleQueryPicker from "./components/SampleQueryPicker";
import { printElement } from "./lib/printUtils";

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023];

export default function SqlExplorerV2() {
  const [status, setStatus] = useState("Booting DuckDB in your browser...");
  const [showApiModal, setShowApiModal] = useState(false);
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [geminiKey, setGeminiKey] = useState("");
  const [prompt, setPrompt] = useState(
    "Create a profile of the latest BRFSS year."
  );
  const [sql, setSql] = useState("");
  const [sqlFlash, setSqlFlash] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [tableMeta, setTableMeta] = useState({});
  const [queryResult, setQueryResult] = useState(null);
  const [resultFlash, setResultFlash] = useState(false);
  const [uploadingYear, setUploadingYear] = useState(null);
  const [selectedSample, setSelectedSample] = useState("");
  const [showSampleModal, setShowSampleModal] = useState(false);
  const [sampleModalMessage, setSampleModalMessage] = useState("");
  const [showPivotModal, setShowPivotModal] = useState(false);
  const [pivotColumns, setPivotColumns] = useState([]);
  const [pivotSelectedColumns, setPivotSelectedColumns] = useState([]);
  const [pivotColumnSearch, setPivotColumnSearch] = useState("");

  const dbRef = useRef(null);
  const connRef = useRef(null);
  const workerUrlRef = useRef(null);
  const sqlFlashTimeoutRef = useRef(null);
  const resultFlashTimeoutRef = useRef(null);
  const queryTableRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const bootDuckDB = async () => {
      try {
        const { db, conn, workerUrl } = await initDuckDB(setStatus);
        if (cancelled) return;
        dbRef.current = db;
        connRef.current = conn;
        workerUrlRef.current = workerUrl;
      } catch (err) {
        console.error(err);
        setError("DuckDB failed to start.");
        setStatus("DuckDB could not start.");
      }
    };

    bootDuckDB();

    return () => {
      cancelled = true;
      connRef.current?.close();
      dbRef.current?.terminate?.();
      if (workerUrlRef.current) {
        URL.revokeObjectURL(workerUrlRef.current);
      }
      if (sqlFlashTimeoutRef.current) {
        clearTimeout(sqlFlashTimeoutRef.current);
      }
      if (resultFlashTimeoutRef.current) {
        clearTimeout(resultFlashTimeoutRef.current);
      }
    };
  }, []);

  const loadedYears = Object.keys(tableMeta)
    .map((year) => Number(year))
    .sort((a, b) => a - b);

  const handleFileUpload = async (year, file) => {
    if (!file || !connRef.current || !dbRef.current) {
      setError("DuckDB is not ready yet.");
      return;
    }
    setUploadingYear(year);
    setError("");
    setMessage("");
    try {
      const { tableName, preview } = await loadCsv(
        dbRef.current,
        connRef.current,
        file,
        year
      );
      setTableMeta((prev) => ({
        ...prev,
        [year]: { name: file.name, size: file.size, preview },
      }));
      setMessage(`Loaded ${file.name} into ${tableName}.`);
    } catch (err) {
      console.error(err);
      setError("Could not load that CSV.");
    } finally {
      setUploadingYear(null);
    }
  };

  const fetchSampleRows = async () => {
    if (!connRef.current || !loadedYears.length) return [];
    try {
      const year = loadedYears[0];
      const result = await runDuckQuery(
        connRef.current,
        `SELECT * FROM brfss_${year} LIMIT 5;`
      );
      return result.rows;
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  const triggerSqlFlash = () => {
    setSqlFlash(true);
    if (sqlFlashTimeoutRef.current) {
      clearTimeout(sqlFlashTimeoutRef.current);
    }
    sqlFlashTimeoutRef.current = setTimeout(() => setSqlFlash(false), 600);
  };

  const triggerResultFlash = () => {
    setResultFlash(true);
    if (resultFlashTimeoutRef.current) {
      clearTimeout(resultFlashTimeoutRef.current);
    }
    resultFlashTimeoutRef.current = setTimeout(
      () => setResultFlash(false),
      600
    );
  };

  const handleDraftSql = async () => {
    if (!geminiKey.trim()) {
      setError("Add a Gemini API key first.");
      return;
    }
    setAiLoading(true);
    setError("");
    setMessage("");
    try {
      const sampleRows = await fetchSampleRows();
      const drafted = await draftSql({
        apiKey: geminiKey.trim(),
        prompt,
        loadedYears,
        sampleRows,
      });
      setSql(drafted);
      triggerSqlFlash();
      setMessage("Gemini drafted SQL for you.");
    } catch (err) {
      console.error(err);
      setError(err.message || "Gemini request failed.");
    } finally {
      setAiLoading(false);
    }
  };

  const runQuery = async (sqlOverride) => {
    if (!connRef.current) {
      setError("DuckDB has not finished loading yet.");
      return;
    }
    const statement = (sqlOverride ?? sql).trim();
    if (!statement) {
      setError("Add SQL to run.");
      return;
    }
    setRunning(true);
    setError("");
    setMessage("");
    setQueryResult(null);
    try {
      const result = await runDuckQuery(connRef.current, statement);
      setQueryResult(result);
      setMessage(
        `Query returned ${result.rows.length} row${
          result.rows.length === 1 ? "" : "s"
        }.`
      );
      triggerResultFlash();
    } catch (err) {
      console.error(err);
      setError(err.message || "Query failed.");
    } finally {
      setRunning(false);
    }
  };

  const handleSampleSelect = async (id) => {
    setSelectedSample(id);
    const sample = SAMPLE_QUERIES.find((q) => q.id === id);
    if (!sample) return;

    const missing = (sample.requiredYears || []).filter(
      (year) => !loadedYears.includes(year)
    );
    if (missing.length) {
      setSampleModalMessage(
        `Please upload CSVs for ${missing.join(
          ", "
        )} to run this sample query.`
      );
      setShowSampleModal(true);
      setSelectedSample("");
      return;
    }

    setPrompt(sample.prompt);
    setSql(sample.sql);
    triggerSqlFlash();
    await runQuery(sample.sql);
  };

  const openPivotModal = () => {
    if (!queryResult || !queryResult.rows?.length) {
      setError("Run a query first to send results to Pivot.");
      return;
    }
    setPivotColumns(queryResult.columns || []);
    setPivotSelectedColumns(queryResult.columns || []);
    setPivotColumnSearch("");
    setShowPivotModal(true);
  };

  const sendToPivot = () => {
    const selected = pivotSelectedColumns.filter(Boolean);
    if (!selected.length) {
      setError("Select at least one column to send to Pivot.");
      return;
    }
    const normalize = (value) =>
      typeof value === "bigint" ? value.toString() : value;
    const filteredRows = queryResult.rows.map((row) => {
      const next = {};
      selected.forEach((col) => {
        next[col] = normalize(row[col]);
      });
      return next;
    });
    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        "pivotTransfer",
        JSON.stringify({ rows: filteredRows, columns: selected })
      );
      window.location.href = "/pivot";
    }
  };

  const handleExportQueryResult = () => {
    if (!queryResult || !queryResult.rows?.length) {
      return;
    }
    const success = printElement(
      queryTableRef.current,
      "BRFSS Query Result"
    );
    if (!success && typeof window !== "undefined") {
      window.alert("Please allow pop-ups to export the table.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-stone-50 to-amber-100 text-stone-900">
      <main className="mx-auto flex max-w-6xl flex-col gap-8 py-10 px-6">
        <NavTabs />
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-amber-700">
              Ohio BRFSS
            </p>
            <h1 className="text-3xl font-semibold leading-tight text-stone-900">
              SQL Explorer
            </h1>
            <p className="text-sm text-stone-600">
              Upload BRFSS CSVs, ask in plain English, review SQL, and run it locally in DuckDB.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowApiModal(true)}
              className="rounded-full bg-stone-900 px-4 py-2 text-sm font-semibold text-amber-50 transition hover:bg-stone-800"
            >
              LLM API Keys
            </button>
            <button
              onClick={() => setShowFilesModal(true)}
              className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-500"
            >
              Load Files
            </button>
            <span className="rounded-full border border-amber-200 bg-white/80 px-4 py-2 text-xs font-semibold text-stone-700 shadow">
              {status}
            </span>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-amber-200 bg-white/80 p-5 shadow-lg shadow-amber-100/60">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-amber-700">
                Natural language
              </p>
                <h3 className="text-lg font-semibold text-stone-900">Ask Gemini</h3>
              </div>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={8}
              className="mt-3 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"
              placeholder="Ask a question about the loaded BRFSS tables..."
            />
            <button
              onClick={handleDraftSql}
              disabled={aiLoading}
              className="mt-3 w-full rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-amber-200 disabled:text-stone-500"
            >
              {aiLoading ? "Drafting..." : "Ask Gemini for SQL"}
            </button>
            <p className="mt-2 text-xs text-stone-600">
              Uses your Gemini API key. Returns SQL directly into the editor.
            </p>
            <div className="mt-4 space-y-1">
              <label className="text-xs uppercase tracking-[0.2em] text-amber-700">
                Sample queries
              </label>
              <SampleQueryPicker
                samples={SAMPLE_QUERIES}
                selectedId={selectedSample}
                onSelect={handleSampleSelect}
              />
              <p className="text-[11px] text-stone-500">
                Selecting a sample fills the SQL editor and runs it immediately.
              </p>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-white to-amber-50 p-5 shadow-lg shadow-amber-100/60">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-700">
                    SQL editor
                  </p>
                  <h3 className="text-lg font-semibold text-stone-900">
                    DuckDB-ready statement
                  </h3>
                </div>
                <button
                  onClick={() => runQuery()}
                  disabled={running}
                  className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-amber-50 transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500"
                >
                  {running ? "Running..." : "Run query"}
                </button>
              </div>
              <textarea
                value={sql}
                onChange={(e) => setSql(e.target.value)}
                rows={14}
                className={`mt-3 w-full rounded-xl border border-amber-200 bg-white px-4 py-3 font-mono text-sm text-stone-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 ${
                  sqlFlash ? "sql-flash" : ""
                }`}
                placeholder="SELECT * FROM brfss_2016 LIMIT 25;"
              />
              <div className="mt-2 text-xs text-stone-600">
                Loaded tables:{" "}
                {loadedYears.length
                  ? loadedYears.map((year) => `brfss_${year}`).join(", ")
                  : "waiting for uploads"}
                .
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-amber-200 bg-white/80 p-5 shadow-lg shadow-amber-100/60">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-stone-900">Query result</h3>
            <div className="flex items-center gap-2">
              {queryResult && queryResult.rows?.length > 0 && (
                <>
                  <button
                    onClick={handleExportQueryResult}
                    className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
                  >
                    Export to PDF
                  </button>
                  <button
                    onClick={openPivotModal}
                    className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
                  >
                    Send to Pivot
                  </button>
                </>
              )}
              {message && <p className="text-xs text-amber-700">{message}</p>}
              {error && (
                <p className="text-xs text-rose-600">
                  {error}
                </p>
              )}
            </div>
          </div>
          {!queryResult && (
            <p className="mt-3 text-sm text-stone-600">
              Run a query to see results. Gemini will fill the SQL editor with DuckDB-only output.
            </p>
          )}
          {queryResult && queryResult.rows.length === 0 && (
            <div
              className={`mt-4 rounded-xl border border-amber-200 bg-white/90 px-4 py-3 text-sm text-stone-700 ${
                resultFlash ? "result-flash" : ""
              }`}
            >
              Query returned zero rows. Adjust your filters and try again.
            </div>
          )}
          {queryResult && queryResult.rows.length > 0 && (
            <div
              className={`mt-4 overflow-hidden rounded-xl border border-amber-200 bg-white/90 ${
                resultFlash ? "result-flash" : ""
              }`}
            >
              <div className="max-h-[28rem] w-full overflow-auto">
                <table
                  ref={queryTableRef}
                  className="min-w-max text-sm text-stone-800"
                >
                  <thead className="bg-amber-100 text-left text-xs font-semibold uppercase tracking-wide text-amber-800">
                    <tr>
                      {queryResult.columns.map((col) => (
                        <th key={col} className="px-4 py-3">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {queryResult.rows.map((row, idx) => (
                      <tr
                        key={idx}
                        className={idx % 2 === 0 ? "bg-amber-50" : ""}
                      >
                        {queryResult.columns.map((col) => (
                          <td
                            key={`${idx}-${col}`}
                            className="whitespace-nowrap px-4 py-2 text-stone-800"
                          >
                            {String(row[col] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {showApiModal && (
          <div className="fixed inset-0 z-20 flex items-center justify-center bg-stone-900/40 px-4">
            <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-700">
                    Credentials
                  </p>
                  <h3 className="text-lg font-semibold text-stone-900">
                    LLM API Keys
                  </h3>
                </div>
                <button
                  onClick={() => setShowApiModal(false)}
                  className="rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-amber-50"
                >
                  Close
                </button>
              </div>
              <div className="mt-4 space-y-3">
                <label className="block text-sm text-stone-700">
                  Gemini API key
                  <input
                    type="password"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="Paste your Gemini key"
                    className="mt-1 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"
                  />
                </label>
                <p className="text-xs text-stone-500">
                  Keys stay in this browser. Gemini is used for SQL drafting.
                </p>
              </div>
            </div>
          </div>
        )}

        {showFilesModal && (
          <div className="fixed inset-0 z-20 flex items-center justify-center bg-stone-900/40 px-4">
            <div className="w-full max-w-3xl rounded-2xl border border-amber-200 bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-700">
                    BRFSS CSVs
                  </p>
                  <h3 className="text-lg font-semibold text-stone-900">
                    Load yearly files
                  </h3>
                  <p className="text-sm text-stone-600">
                    Upload brfss16.csv through brfss23.csv. Each becomes brfss_YEAR in DuckDB.
                  </p>
                </div>
                <button
                  onClick={() => setShowFilesModal(false)}
                  className="rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-amber-50"
                >
                  Close
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {YEARS.map((year) => (
                  <label
                    key={year}
                    className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-stone-800"
                  >
                    <div className="space-y-1">
                      <p className="font-semibold text-stone-900">
                        brfss{String(year).slice(2)}.csv
                      </p>
                      <p className="text-xs text-stone-600">
                        Loads as brfss_{year}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {tableMeta[year] ? (
                        <span className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                          Loaded
                        </span>
                      ) : (
                        <span className="flex items-center gap-2 text-xs font-semibold text-amber-700">
                          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                          Pending
                        </span>
                      )}
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => handleFileUpload(year, e.target.files?.[0])}
                      disabled={uploadingYear === year}
                      className="w-40 cursor-pointer text-xs text-stone-700 file:mr-2 file:rounded-lg file:border-0 file:bg-amber-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                    />
                    </div>
                  </label>
                ))}
              </div>
              <div className="mt-3 text-xs text-stone-600">
                Loaded:{" "}
                {loadedYears.length
                  ? loadedYears.map((year) => `brfss_${year}`).join(", ")
                  : "none yet"}
                .
              </div>
            </div>
          </div>
        )}

        {showPivotModal && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-stone-900/40 px-4">
            <div className="w-full max-w-2xl rounded-2xl border border-amber-200 bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-amber-700">
                    Pivot export
                  </p>
                  <h3 className="text-lg font-semibold text-stone-900">
                    Select columns to send to Pivot
                  </h3>
                  <p className="text-sm text-stone-600">
                    Choose the fields to include. Pivot will open on the next page.
                  </p>
                </div>
                <button
                  onClick={() => setShowPivotModal(false)}
                  className="rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-amber-50"
                >
                  Close
                </button>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <input
                  type="text"
                  value={pivotColumnSearch}
                  onChange={(e) => setPivotColumnSearch(e.target.value)}
                  placeholder="Search columns..."
                  className="flex-1 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30"
                />
                <button
                  onClick={() => setPivotSelectedColumns(pivotColumns)}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
                >
                  Select all
                </button>
                <button
                  onClick={() => setPivotSelectedColumns([])}
                  className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
                >
                  Deselect all
                </button>
                <button
                  onClick={sendToPivot}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-500"
                >
                  Send to Pivot
                </button>
              </div>
              <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {pivotColumns
                    .filter((col) =>
                      col.toLowerCase().includes(pivotColumnSearch.trim().toLowerCase())
                    )
                    .map((col) => {
                      const checked = pivotSelectedColumns.includes(col);
                      return (
                        <label
                          key={col}
                          className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm text-stone-800 shadow-sm"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setPivotSelectedColumns((prev) =>
                                  prev.includes(col) ? prev : [...prev, col]
                                );
                              } else {
                                setPivotSelectedColumns((prev) =>
                                  prev.filter((c) => c !== col)
                                );
                              }
                            }}
                            className="h-4 w-4 rounded border-amber-300 text-amber-600"
                          />
                          <span className="truncate" title={col}>
                            {col}
                          </span>
                        </label>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        )}

        {showSampleModal && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-stone-900/40 px-4">
            <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-stone-900">Upload required files</h3>
                <button
                  onClick={() => setShowSampleModal(false)}
                  className="rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-amber-50"
                >
                  Close
                </button>
              </div>
              <p className="mt-3 text-sm text-stone-700">
                {sampleModalMessage ||
                  "Please upload the required CSVs to run this sample query."}
              </p>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => {
                    setShowSampleModal(false);
                    setShowFilesModal(true);
                  }}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-500"
                >
                  Open file uploader
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

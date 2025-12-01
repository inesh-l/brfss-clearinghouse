"use client";

import {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} from "@google/genai";

const MODEL_NAME = "gemini-2.5-flash";
const INFO_FILE_YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022];

const safeStringify = (value) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));

async function fetchInfoFileParts(ai, loadedYears = []) {
  const targetYears = INFO_FILE_YEARS.filter((year) =>
    loadedYears.includes(year)
  );

  if (!targetYears.length) {
    return { parts: [], attachedYears: [] };
  }

  const settled = await Promise.allSettled(
    targetYears.map(async (year) => {
      const file = await ai.files.get({ name: `${year}-info` });
      if (!file?.uri) throw new Error("missing uri");
      return {
        year,
        part: createPartFromUri(file.uri, file.mimeType || "text/plain"),
      };
    })
  );

  const parts = [];
  const attachedYears = [];

  settled.forEach((result) => {
    if (result.status === "fulfilled") {
      parts.push(result.value.part);
      attachedYears.push(result.value.year);
    }
  });

  return { parts, attachedYears };
}

export async function generateSqlAndExplanation({
  apiKey,
  prompt,
  sampleRows,
  loadedYears = [],
}) {
  const sampleText =
    sampleRows && sampleRows.length
      ? sampleRows
          .slice(0, 6)
          .map((row, idx) => `${idx + 1}. ${safeStringify(row)}`)
          .join("\n")
      : "Sample rows not provided.";

  const availableTables =
    loadedYears.length > 0
      ? loadedYears.map((year) => `brfss_${year}`).join(", ")
      : "None loaded yet.";

  const genAI = new GoogleGenAI({ apiKey });
  const { parts: infoParts, attachedYears } = await fetchInfoFileParts(
    genAI,
    loadedYears
  );

  const infoFilesNote = attachedYears.length
    ? `Info files attached for: ${attachedYears
        .sort((a, b) => a - b)
        .map((y) => `${y}-info`)
        .join(", ")}. Use these for column descriptions and value meanings.`
    : "No info files attached. If available, rely on sample rows and table names.";

  const userPrompt = `You are an expert data analyst writing DuckDB SQL only.

Dataset summary:
Available tables (one per year): ${availableTables}
${infoFilesNote}
Cross-year queries require you to explicitly reference multiple tables (e.g., UNION ALL over brfss_2018 and brfss_2019, adding a survey_year column).
Sample rows (from the first loaded table):
${sampleText}

User request: ${prompt}

Return your response in exactly this format:
SQL:
<DuckDB SQL only, no markdown fences>

EXPLANATION:
<1-2 sentences describing what the query returns>
`;

  let result;
  try {
    result = await genAI.models.generateContent({
      model: MODEL_NAME,
      contents: createUserContent([
        ...infoParts,
        infoFilesNote,
        userPrompt,
      ]),
    });
  } catch (err) {
    const message =
      err?.message || err?.toString() || "Gemini request failed.";
    throw new Error(`Gemini error: ${message}`);
  }
  console.log(result.text)
  const raw = result?.text || "";
  if (!raw.trim()) {
    throw new Error("Gemini did not return any text.");
  }

  const cleaned = raw.replace(/```sql/gi, "").replace(/```/g, "").trim();

  const sqlMatch = cleaned.match(/SQL:\s*([\s\S]*?)(?:\nEXPLANATION:|$)/i);
  const explanationMatch = cleaned.match(/EXPLANATION:\s*([\s\S]*)/i);

  const sql = (sqlMatch?.[1] || cleaned).trim();
  const explanation = (explanationMatch?.[1] || "").trim();

  return { sql, explanation };
}

export async function checkInfoFilesPresence({ apiKey, years = [] }) {
  if (!apiKey) {
    throw new Error("Gemini API key required to check files.");
  }

  const ai = new GoogleGenAI({ apiKey });
  let pager;

  try {
    pager = await ai.files.list({ config: { pageSize: 100 } });
  } catch (err) {
    const message = err?.message || "Could not list Gemini files.";
    throw new Error(message);
  }

  const targets = years.map((year) => `${year}-info`.toLowerCase());
  const foundYears = new Set();

  try {
    for await (const file of pager) {
      const display = (file.displayName || "").toLowerCase();
      const name = (file.name || "").toLowerCase();
      targets.forEach((target, idx) => {
        if (display === target || name.endsWith(target)) {
          foundYears.add(years[idx]);
        }
      });
    }
  } catch (err) {
    const message = err?.message || "Gemini file iteration failed.";
    throw new Error(message);
  }

  const statuses = years.reduce((acc, year) => {
    acc[year] = foundYears.has(year);
    return acc;
  }, {});

  return { statuses, foundYears: Array.from(foundYears) };
}

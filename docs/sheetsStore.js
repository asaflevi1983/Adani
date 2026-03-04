/**
 * sheetsStore.js
 * Google Sheets fetching and parsing for the Car Owners Social Wall.
 *
 * DB model:
 *   Posts are rows in a public Google Sheet.
 *   Expected column headers (row 1):
 *     plate | category | title | body | author | createdAt
 *
 * Reads from the public Google Sheet via the Google Visualization API CSV endpoint.
 * The sheet must be shared as "Anyone with the link can view".
 */

"use strict";

const SheetsStore = (() => {
  const SHEET_ID = "1t9tFiBdqYO74K-ysGrR-ButnteVX4qD7RcrFvGbQdQs";
  const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

  // ── CSV parser ────────────────────────────────────────────────────────────

  /**
   * Parse a CSV string into an array of row-arrays.
   * Handles quoted fields (including fields containing commas or newlines).
   */
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          // Peek ahead: "" inside quotes is an escaped quote
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          row.push(field);
          field = "";
        } else if (ch === "\r") {
          // ignore CR in CRLF
        } else if (ch === "\n") {
          row.push(field);
          rows.push(row);
          row = [];
          field = "";
        } else {
          field += ch;
        }
      }
    }
    // Last field / row
    if (field || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  /**
   * Convert parsed CSV rows into post objects.
   * The first row is treated as the header row.
   * Column names are matched case-insensitively and trimmed.
   */
  function csvRowsToPosts(rows) {
    if (!rows || rows.length < 2) return [];

    // Map column names to indices
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (name) => header.indexOf(name);

    const iPlate     = col("plate");
    const iCategory  = col("category");
    const iTitle     = col("title");
    const iBody      = col("body");
    const iAuthor    = col("author");
    const iCreatedAt = col("createdat");

    const posts = [];
    for (let r = 1; r < rows.length; r++) {
      const cells = rows[r];
      const plate = iPlate >= 0 ? String(cells[iPlate] || "").replace(/\D/g, "") : "";
      if (!plate) continue; // skip rows without a plate number

      posts.push({
        id:        r,
        plate:     plate,
        category:  iCategory  >= 0 ? (cells[iCategory]  || "notice").trim().toLowerCase() : "notice",
        title:     iTitle     >= 0 ? (cells[iTitle]     || "").trim()                      : "",
        body:      iBody      >= 0 ? (cells[iBody]      || "").trim()                      : "",
        author:    iAuthor    >= 0 ? (cells[iAuthor]    || "").trim()                      : "",
        createdAt: iCreatedAt >= 0 ? (cells[iCreatedAt] || "").trim()                      : "",
      });
    }
    return posts;
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────

  /**
   * Fetch all posts from the Google Sheet and return them as an array.
   * Posts are sorted newest-first (reversed row order if the sheet is
   * oldest-first, which is the typical append pattern).
   */
  async function fetchAllPosts() {
    const resp = await fetch(SHEET_URL);
    if (!resp.ok) {
      throw new Error(`שגיאה בטעינת נתונים מהגיליון (${resp.status})`);
    }
    const csv = await resp.text();
    const rows = parseCsv(csv);
    const posts = csvRowsToPosts(rows);
    // Reverse so that the most recently added row (bottom of sheet) appears first
    return posts.reverse();
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  /** Return only the posts matching a specific (normalized-digits) plate. */
  function getPostsForPlate(allPosts, plate) {
    const norm = String(plate).replace(/\D/g, "");
    return allPosts.filter((p) => p.plate === norm);
  }

  // ── Public surface ────────────────────────────────────────────────────────
  return {
    fetchAllPosts,
    getPostsForPlate,
  };
})();

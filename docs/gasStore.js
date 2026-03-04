/**
 * gasStore.js
 * Client-side data store for the Car Owners Social Wall.
 *
 * Reads and writes data via the Google Apps Script Web App API.
 *
 * SETUP:
 *   1. Deploy apps-script/Code.gs as a Google Apps Script Web App
 *      (Execute as: Me, Who has access: Anyone).
 *   2. Replace GAS_URL below with your deployed Web App URL.
 */

"use strict";

const GasStore = (() => {
  // ── Configuration ────────────────────────────────────────────────────────
  // Replace with your deployed Google Apps Script Web App URL:
  const GAS_URL = "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec";

  // Warn once at module load if URL has not been configured
  if (GAS_URL.includes("YOUR_SCRIPT_ID")) {
    // eslint-disable-next-line no-console
    console.warn(
      "[GasStore] GAS_URL is not configured. " +
      "Deploy apps-script/Code.gs as a Web App and set GAS_URL in gasStore.js."
    );
  }

  function isConfigured() {
    return Boolean(GAS_URL && !GAS_URL.includes("YOUR_SCRIPT_ID"));
  }

  // ── Fetch helpers ─────────────────────────────────────────────────────────

  async function apiFetch(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`שגיאת רשת (${resp.status})`);
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "שגיאה לא ידועה");
    return data;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Fetch the 20 most-recent posts across all plates. */
  async function fetchRecentPosts() {
    if (!isConfigured()) return [];
    const data = await apiFetch(`${GAS_URL}?action=recent`);
    return data.posts || [];
  }

  /** Fetch all visible posts for a specific (normalized) plate. */
  async function fetchPostsForPlate(plate) {
    if (!isConfigured()) return [];
    const norm = String(plate).replace(/\D/g, "");
    const data = await apiFetch(
      `${GAS_URL}?action=list&plate=${encodeURIComponent(norm)}`
    );
    return data.posts || [];
  }

  /**
   * Submit a new post.
   * Uses Content-Type: text/plain to avoid a CORS preflight (GAS does not
   * handle OPTIONS requests but does return Access-Control-Allow-Origin: *).
   */
  async function submitPost(plate, category, content, author) {
    if (!isConfigured()) {
      throw new Error(
        "כתובת ה-API לא הוגדרה. עדכן את GAS_URL ב-gasStore.js לאחר פריסת ה-Web App."
      );
    }
    const resp = await fetch(GAS_URL, {
      method:  "POST",
      headers: { "Content-Type": "text/plain" },
      body:    JSON.stringify({ plate, category, content, author }),
    });
    if (!resp.ok) throw new Error(`שגיאת רשת בשליחה (${resp.status})`);
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || "שגיאה בשליחת הפוסט");
    return data;
  }

  return { isConfigured, fetchRecentPosts, fetchPostsForPlate, submitPost };
})();

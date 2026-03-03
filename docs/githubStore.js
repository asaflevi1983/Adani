/**
 * githubStore.js
 * GitHub Issues fetching, parsing, and URL helpers for the Car Owners Social Wall.
 *
 * DB model:
 *   Each post is a GitHub Issue in this repo.
 *   Title format: "[PLATE:1234567] short summary"
 *   Category stored as a GitHub label: category:notice / category:warning /
 *                                      category:compliment / category:question
 *
 * Reads from /data/posts.json (cached by workflow) first; falls back to live API.
 */

"use strict";

const GithubStore = (() => {
  const OWNER    = "asaflevi1983";
  const REPO     = "Adani";
  const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;
  // Relative path — works both on GitHub Pages (/Adani/data/posts.json)
  // and locally (http://localhost:8080/data/posts.json).
  const CACHE_PATH = "data/posts.json";

  // ── Parsers ──────────────────────────────────────────────────────────────

  /** Extract the plate digits from a title like "[PLATE:1234567] summary". */
  function parsePlateFromTitle(title) {
    const m = String(title).match(/^\[PLATE:(\d+)\]/i);
    return m ? m[1] : null;
  }

  /** Extract category string from an array of label objects or strings. */
  function parseCategoryFromLabels(labels) {
    if (!Array.isArray(labels)) return "notice";
    for (const lbl of labels) {
      const name = typeof lbl === "string" ? lbl : (lbl && lbl.name);
      if (name && name.startsWith("category:")) {
        return name.slice("category:".length);
      }
    }
    return "notice";
  }

  /** Strip "[PLATE:XXXXX] " prefix from a title to get the human summary. */
  function parseTitleSummary(title) {
    return String(title).replace(/^\[PLATE:\d+\]\s*/i, "").trim();
  }

  /**
   * Normalize a raw GitHub Issue object into our internal post shape:
   * { id, url, plate, category, title, body, author, authorUrl, createdAt }
   */
  function normalizeIssue(issue) {
    return {
      id:        issue.number,
      url:       issue.html_url,
      plate:     parsePlateFromTitle(issue.title || ""),
      category:  parseCategoryFromLabels(issue.labels || []),
      title:     parseTitleSummary(issue.title || ""),
      body:      issue.body || "",
      author:    issue.user ? issue.user.login : "",
      authorUrl: issue.user ? `https://github.com/${issue.user.login}` : "#",
      createdAt: issue.created_at || "",
    };
  }

  // ── Fetch helpers ─────────────────────────────────────────────────────────

  /**
   * Try loading the pre-generated cache file first.
   * Falls back to live GitHub API on any failure.
   */
  async function fetchAllPosts() {
    try {
      // Add timestamp to bust browser cache when the file updates
      const resp = await fetch(CACHE_PATH);
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data)) {
          return data;
        }
      }
    } catch (e) {
      console.warn("Cache unavailable, falling back to GitHub API:", e);
    }
    return fetchFromApi();
  }

  /**
   * Live fetch from GitHub Issues API (up to 100 open issues).
   * Filters out pull requests and issues without a parseable plate prefix.
   */
  async function fetchFromApi() {
    const url = `${API_BASE}/issues?state=open&per_page=100&sort=created&direction=desc`;
    const resp = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (resp.status === 403 || resp.status === 429) {
      throw new Error("הגעת למגבלת הקריאות של GitHub API. נסה שוב מאוחר יותר.");
    }
    if (!resp.ok) {
      throw new Error(`שגיאה בטעינת פוסטים (${resp.status})`);
    }
    const issues = await resp.json();
    return issues
      .filter((i) => !i.pull_request)
      .map(normalizeIssue)
      .filter((p) => p.plate);
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  /** Return only the posts matching a specific (normalized-digits) plate. */
  function getPostsForPlate(allPosts, plate) {
    const norm = String(plate).replace(/\D/g, "");
    return allPosts.filter((p) => p.plate === norm);
  }

  /**
   * Build the GitHub "New Issue" URL with prefilled title, body and labels for a plate.
   * postTitle and postBody come from the custom form; both are optional and fall back
   * to placeholder templates so the link is still useful when called without them.
   * The user only needs a GitHub account; no OAuth setup needed.
   */
  function buildNewIssueUrl(plate, category, postTitle, postBody) {
    const cat        = category || "notice";
    const issueTitle = `[PLATE:${plate}] ${postTitle || ""}`.trimEnd();
    const issueBody  = postBody ||
      `**קטגוריה:** ${cat}\n\n` +
      `**תוכן ההודעה:**\n<!-- כתוב את ההודעה שלך כאן -->\n\n` +
      `**מיקום (אופציונלי):**\n\n` +
      `**תאריך (אופציונלי):**`;
    const params = new URLSearchParams({
      title:  issueTitle,
      body:   issueBody,
      labels: `category:${cat}`,
    });
    return `https://github.com/${OWNER}/${REPO}/issues/new?${params.toString()}`;
  }

  // ── Public surface ────────────────────────────────────────────────────────
  return {
    fetchAllPosts,
    fetchFromApi,
    getPostsForPlate,
    buildNewIssueUrl,
    normalizeIssue,
    parsePlateFromTitle,
  };
})();

/**
 * app.js
 * Hash-based router and UI controllers for the Car Owners Social Wall.
 *
 * Routes:
 *   /#/                  → Home / plate search + recent posts
 *   /#/vehicle/<plate>   → Vehicle posts page
 *   /#/about             → About page
 */

"use strict";

// ── Constants ─────────────────────────────────────────────────────────────

const RECENT_POSTS_LIMIT  = 10;
const BODY_PREVIEW_LENGTH = 300;

const CATEGORY_LABELS = {
  notice:     "הודעה",
  warning:    "אזהרה",
  compliment: "מחמאה",
  question:   "שאלה",
};

const CATEGORY_CLASS = {
  notice:     "cat-notice",
  warning:    "cat-warning",
  compliment: "cat-compliment",
  question:   "cat-question",
};

// ── Helpers ───────────────────────────────────────────────────────────────

function normalizePlate(raw) {
  return String(raw).replace(/\D/g, "");
}

/**
 * Format plate for display: add dashes for Israeli plates.
 * e.g. "1234567" → "12-345-67"    (7 digits, format XX-XXX-XX)
 *      "12345678" → "123-45-678"  (8 digits, format XXX-XX-XXX)
 * Falls back to raw if unexpected length.
 */
function formatPlate(norm) {
  if (norm.length === 7) return `${norm.slice(0,2)}-${norm.slice(2,5)}-${norm.slice(5)}`;
  if (norm.length === 8) return `${norm.slice(0,3)}-${norm.slice(3,5)}-${norm.slice(5)}`;
  return norm;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(isoStr) {
  if (!isoStr) return "";
  try {
    return new Date(isoStr).toLocaleString("he-IL", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

// ── Router ────────────────────────────────────────────────────────────────

const elContent = () => document.getElementById("app-content");

function getRoute() {
  const hash = window.location.hash || "#/";
  const path = hash.startsWith("#") ? hash.slice(1) : hash;
  return path || "/";
}

function navigate(path) {
  window.location.hash = path;
}

function router() {
  const path = getRoute();
  if (path === "/" || path === "") {
    renderHome();
  } else if (path.startsWith("/vehicle/")) {
    const plate = path.slice("/vehicle/".length);
    renderVehicle(plate);
  } else if (path === "/about") {
    renderAbout();
  } else {
    navigate("/");
  }
}

// ── Home Page ─────────────────────────────────────────────────────────────

function renderHome() {
  const el = elContent();
  el.innerHTML = `
    <h2 class="page-title">חיפוש רכב לפי מספר רישוי</h2>
    <div class="card">
      <div class="form-group">
        <label for="plate-input">מספר לוחית רישוי</label>
        <div class="search-row">
          <input type="text" id="plate-input" placeholder="לדוגמה: 12-345-67"
                 maxlength="11" autocomplete="off" dir="ltr">
          <button class="btn btn-primary" id="search-btn">חפש</button>
          <button class="btn btn-secondary" id="ocr-btn" title="זיהוי לוחית מתמונה">📷</button>
          <input type="file" id="plate-image-input" accept="image/*" hidden>
        </div>
        <span class="field-error" id="plate-error" hidden></span>
        <div id="ocr-status" class="status-msg" hidden></div>
      </div>
    </div>
    <p class="hint-text">
      הקלד את מספר הרישוי (7 או 8 ספרות, עם או בלי מקפים) ולחץ חפש,
      או לחץ על 📷 כדי לזהות לוחית מתמונה.
    </p>

    <h3 class="section-title">פוסטים אחרונים</h3>
    <div id="recent-posts">
      <div class="loading-row">
        <span class="spinner"></span>
        <span>טוען פוסטים...</span>
      </div>
    </div>
  `;

  const input      = document.getElementById("plate-input");
  const btn        = document.getElementById("search-btn");
  const errSpan    = document.getElementById("plate-error");
  const ocrBtn     = document.getElementById("ocr-btn");
  const imageInput = document.getElementById("plate-image-input");
  const ocrStatus  = document.getElementById("ocr-status");

  function doSearch() {
    const norm = normalizePlate(input.value);
    if (norm.length < 5 || norm.length > 8) {
      errSpan.textContent = "מספר רישוי חייב להכיל 5–8 ספרות.";
      errSpan.hidden = false;
      input.focus();
      return;
    }
    errSpan.hidden = true;
    navigate(`/vehicle/${norm}`);
  }

  btn.addEventListener("click", doSearch);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

  ocrBtn.addEventListener("click", () => imageInput.click());

  imageInput.addEventListener("change", async () => {
    const file = imageInput.files[0];
    if (!file) return;
    imageInput.value = ""; // reset so the same file can be re-selected
    await runPlateOCR(file, input, errSpan, ocrStatus);
  });

  // Load recent posts in the background
  loadRecentPosts();
}

/**
 * Use Tesseract.js (loaded via CDN) to recognize an Israeli license plate
 * number from an image file and pre-fill the plate input.
 */
async function runPlateOCR(file, inputEl, errSpan, statusEl) {
  if (typeof Tesseract === "undefined") {
    statusEl.textContent = "ספריית זיהוי תמונה עדיין נטענת — נסה שוב עוד רגע.";
    statusEl.className = "status-msg status-warning";
    statusEl.hidden = false;
    return;
  }

  statusEl.textContent = "מזהה לוחית רישוי מהתמונה…";
  statusEl.className = "status-msg status-info";
  statusEl.hidden = false;
  errSpan.hidden = true;

  try {
    const { data: { text } } = await Tesseract.recognize(file, "eng", {
      tessedit_char_whitelist: "0123456789",
    });

    // Extract digit sequences and look for a 7–8 digit Israeli plate.
    // Use alternation (8|7) so an 8-digit sequence is preferred over 7.
    const digits = text.replace(/\D/g, "");
    const match  = digits.match(/\d{8}|\d{7}/);

    if (match) {
      inputEl.value = formatPlate(match[0]);
      statusEl.textContent = `זוהה: ${formatPlate(match[0])} — לחץ חפש לאישור.`;
      statusEl.className = "status-msg status-success";
      inputEl.focus();
    } else {
      statusEl.textContent = "לא נמצא מספר לוחית בתמונה. נסה תמונה ברורה יותר.";
      statusEl.className = "status-msg status-warning";
    }
  } catch (err) {
    console.error("OCR error:", err);
    statusEl.textContent = "שגיאה בזיהוי התמונה. נסה שוב.";
    statusEl.className = "status-msg status-error";
  }
}

async function loadRecentPosts() {
  const section = document.getElementById("recent-posts");
  if (!section) return;
  try {
    const all = await GithubStore.fetchAllPosts();
    // Show the 10 most recent posts across all plates
    const recent = all.slice(0, RECENT_POSTS_LIMIT);
    if (!recent.length) {
      section.innerHTML = `<div class="empty-state">אין פוסטים עדיין.</div>`;
      return;
    }
    section.innerHTML = `<div class="post-list">${recent.map(renderPostCard).join("")}</div>`;
  } catch (err) {
    section.innerHTML = `<div class="status-msg status-error">${escHtml(err.message)}</div>`;
  }
}

// ── Vehicle Page ──────────────────────────────────────────────────────────

async function renderVehicle(rawPlate) {
  const norm = normalizePlate(rawPlate);
  if (norm.length < 5 || norm.length > 8) {
    navigate("/");
    return;
  }

  const el = elContent();
  el.innerHTML = `
    <a href="#/" class="btn btn-back">← חזרה לחיפוש</a>
    <div class="card">
      <div class="plate-display" dir="ltr">${escHtml(formatPlate(norm))}</div>
      <h2 class="page-title" style="margin-bottom:0;">הודעות על הרכב</h2>
    </div>

    <div class="card write-cta">
      <p>יש לך מה להגיד על הרכב הזה? מלא את הפרטים למטה ופרסם הודעה.</p>
      <form id="post-form" class="post-form" novalidate>
        <div class="form-group">
          <label for="post-category">קטגוריה</label>
          <select id="post-category" name="category" required>
            <option value="notice">הודעה</option>
            <option value="warning">אזהרה</option>
            <option value="compliment">מחמאה</option>
            <option value="question">שאלה</option>
          </select>
        </div>
        <div class="form-group">
          <label for="post-title">כותרת</label>
          <input type="text" id="post-title" name="title" maxlength="120"
                 placeholder="תיאור קצר…" required autocomplete="off">
          <span class="field-error" id="post-title-error" hidden></span>
        </div>
        <div class="form-group">
          <label for="post-body">תוכן ההודעה</label>
          <textarea id="post-body" name="body" rows="4" maxlength="2000"
                    placeholder="כתוב את ההודעה שלך כאן…" required></textarea>
          <span class="field-error" id="post-body-error" hidden></span>
        </div>
        <div id="post-form-status" class="status-msg" hidden></div>
        <button type="submit" class="btn btn-primary">✏️ פרסם הודעה</button>
      </form>
    </div>

    <div class="filter-bar">
      <span>סינון לפי קטגוריה:</span>
      <button class="filter-btn active" data-cat="">הכל</button>
      <button class="filter-btn" data-cat="notice">הודעה</button>
      <button class="filter-btn" data-cat="warning">אזהרה</button>
      <button class="filter-btn" data-cat="compliment">מחמאה</button>
      <button class="filter-btn" data-cat="question">שאלה</button>
    </div>

    <div id="posts-section">
      <div class="loading-row">
        <span class="spinner"></span>
        <span>טוען הודעות...</span>
      </div>
    </div>
  `;

  // Wire up the post form
  const postForm       = document.getElementById("post-form");
  const titleInput     = document.getElementById("post-title");
  const bodyInput      = document.getElementById("post-body");
  const titleErr       = document.getElementById("post-title-error");
  const bodyErr        = document.getElementById("post-body-error");
  const formStatus     = document.getElementById("post-form-status");

  postForm.addEventListener("submit", (e) => {
    e.preventDefault();
    let valid = true;

    titleErr.hidden = true;
    bodyErr.hidden  = true;
    formStatus.hidden = true;

    if (!titleInput.value.trim()) {
      titleErr.textContent = "נא להזין כותרת.";
      titleErr.hidden = false;
      valid = false;
    }
    if (!bodyInput.value.trim()) {
      bodyErr.textContent = "נא להזין תוכן הודעה.";
      bodyErr.hidden = false;
      valid = false;
    }
    if (!valid) return;

    const category = document.getElementById("post-category").value;
    const issueUrl = GithubStore.buildNewIssueUrl(
      norm,
      category,
      titleInput.value.trim(),
      bodyInput.value.trim()
    );
    window.open(issueUrl, "_blank", "noopener,noreferrer");

    formStatus.innerHTML =
      "נפתח חלון GitHub ליצירת הפוסט. לאחר שתשלח את ה-Issue, הפוסט יופיע כאן תוך מספר דקות." +
      ' <button type="button" id="refresh-posts-btn" class="btn btn-secondary">🔄 רענן פוסטים</button>';
    formStatus.className = "status-msg status-success";
    formStatus.hidden    = false;
    postForm.reset();
  });

  // Delegate refresh-button clicks so the listener is only registered once
  formStatus.addEventListener("click", async (e) => {
    if (!e.target.closest("#refresh-posts-btn")) return;
    const section = document.getElementById("posts-section");
    if (!section) return;
    section.innerHTML = '<div class="loading-row"><span class="spinner"></span><span>טוען הודעות...</span></div>';
    try {
      const all = await GithubStore.fetchFromApi();
      allVehiclePosts = GithubStore.getPostsForPlate(all, norm);
      applyFilter();
    } catch (err) {
      console.error("Refresh failed:", err);
      section.innerHTML = '<div class="status-msg status-error">שגיאה בטעינת ההודעות. נסה שוב מאוחר יותר.</div>';
    }
  });

  // Filter buttons
  let activeFilter = "";
  let allVehiclePosts = [];

  document.querySelector(".filter-bar").addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-btn");
    if (!btn) return;
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.cat;
    applyFilter();
  });

  function applyFilter() {
    const section = document.getElementById("posts-section");
    if (!section) return;
    const filtered = activeFilter
      ? allVehiclePosts.filter((p) => p.category === activeFilter)
      : allVehiclePosts;
    renderPostsList(section, filtered);
  }

  // Load posts
  try {
    const all = await GithubStore.fetchAllPosts();
    allVehiclePosts = GithubStore.getPostsForPlate(all, norm);
    applyFilter();
  } catch (err) {
    const section = document.getElementById("posts-section");
    if (section) {
      section.innerHTML = `<div class="status-msg status-error">${escHtml(err.message)}</div>`;
    }
  }
}

function renderPostsList(container, posts) {
  if (!posts || posts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        אין הודעות עדיין לרכב זה. היה הראשון לפרסם!
      </div>
    `;
    return;
  }
  container.innerHTML = `<div class="post-list">${posts.map(renderPostCard).join("")}</div>`;
}

function renderPostCard(post) {
  const catLabel = CATEGORY_LABELS[post.category] || escHtml(post.category);
  const catClass = CATEGORY_CLASS[post.category] || "";
  // Render body as plain text (no HTML injection)
  const bodyPreview = post.body
    ? escHtml(post.body.slice(0, BODY_PREVIEW_LENGTH)) + (post.body.length > BODY_PREVIEW_LENGTH ? "…" : "")
    : "";
  return `
    <div class="post-item" data-category="${escHtml(post.category)}">
      <div class="post-header">
        <span class="category-badge ${catClass}">${catLabel}</span>
        <a class="post-author" href="${escHtml(post.authorUrl)}" target="_blank"
           rel="noopener noreferrer">@${escHtml(post.author)}</a>
        <span class="post-date">${escHtml(formatDate(post.createdAt))}</span>
        ${post.plate ? `<a class="plate-link" href="#/vehicle/${escHtml(post.plate)}"
            title="עבור לדף הרכב">${escHtml(formatPlate(post.plate))}</a>` : ""}
      </div>
      ${post.title ? `<div class="post-title">${escHtml(post.title)}</div>` : ""}
      ${bodyPreview ? `<div class="post-content">${bodyPreview}</div>` : ""}
    </div>
  `;
}

// ── About Page ────────────────────────────────────────────────────────────

function renderAbout() {
  elContent().innerHTML = `
    <h2 class="page-title">אודות</h2>
    <div class="card about-section">
      <h3>מה זה?</h3>
      <p>
        "קיר חברתי לבעלי רכב" — אפליקציה המאפשרת לציבור לפרסם הודעות,
        אזהרות, מחמאות ושאלות על מספרי לוחיות רישוי.
      </p>

      <h3>איך לפרסם?</h3>
      <ol>
        <li>חפש את מספר הרישוי בעמוד הבית.</li>
        <li>בדף הרכב מלא את טופס ה"פרסם הודעה" ולחץ שלח.</li>
        <li>ההודעה תופיע לאחר בדיקה ואישור.</li>
      </ol>

      <h3>פורמט מספר רישוי</h3>
      <p>
        ספרות בלבד, 5–8 ספרות. למשל: <code>1234567</code> או <code>12345678</code>.
      </p>

      <h3>אחסון נתונים</h3>
      <p>
        כל ההודעות מאוחסנות ומנוהלות בשרת. הן גלויות לכל אחד לאחר אישור.
      </p>

      <h3>מודרציה</h3>
      <p>
        תוכן פוגעני או ספאם יוסרו על ידי הצוות המנהל.
        ניתן לפנות אלינו לדיווח על תוכן בעייתי.
      </p>

      <h3>פרטיות</h3>
      <p>
        מספרי הרישוי וההודעות הם <strong>מידע ציבורי</strong>.
        אין לפרסם מידע אישי מזהה. האפליקציה אינה אוספת נתונים.
      </p>

      <h3>הגבלות</h3>
      <ul>
        <li>זהו דמו MVP — לא מוצר מסחרי.</li>
        <li>אין אינטגרציה רשמית עם רשות הרישוי / משרד התחבורה.</li>
        <li>המידע באפליקציה אינו מאומת ואינו בעל תוקף משפטי.</li>
      </ul>
    </div>
  `;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────

function bootstrap() {
  window.addEventListener("hashchange", router);
  router();
}

document.addEventListener("DOMContentLoaded", bootstrap);

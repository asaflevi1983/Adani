/**
 * app.js
 * Hash-based router and UI controllers for the Car Owners Social Wall.
 *
 * Routes:
 *   /#/          → Home / search
 *   /#/vehicle/<plate>  → Vehicle posts page
 *   /#/about     → About page
 *
 * All pages are blocked behind the Drive auth gate.
 */

"use strict";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Display text for post categories (Hebrew). */
const CATEGORY_LABELS = {
  notice:     "הודעה",
  warning:    "אזהרה",
  compliment: "מחמאה",
  question:   "שאלה",
};

/** CSS class for category badge. */
const CATEGORY_CLASS = {
  notice:     "cat-notice",
  warning:    "cat-warning",
  compliment: "cat-compliment",
  question:   "cat-question",
};

/**
 * Normalize plate: digits only.
 */
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

/** Escape HTML to prevent XSS when inserting user content. */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Format a timestamp (ms) as a Hebrew-locale date+time string. */
function formatDate(ts) {
  try {
    return new Date(ts).toLocaleString("he-IL", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return new Date(ts).toLocaleString();
  }
}

/** Show a status message inside a container element. */
function showStatus(container, message, type = "info") {
  const el = container.querySelector(".status-msg") || (() => {
    const d = document.createElement("div");
    d.className = "status-msg";
    container.prepend(d);
    return d;
  })();
  el.textContent = message;
  el.className = `status-msg status-${type}`;
  el.hidden = false;
}

/** Clear any status message inside a container. */
function clearStatus(container) {
  const el = container.querySelector(".status-msg");
  if (el) el.hidden = true;
}

// ── DOM references (resolved after DOMContentLoaded) ──────────────────────

let elAuthGate, elAppContent, elUserName, elUserAvatar, elUserInfo, elSignoutBtn;

// ── Router ────────────────────────────────────────────────────────────────

function getRoute() {
  const hash = window.location.hash || "#/";
  const path = hash.startsWith("#") ? hash.slice(1) : hash;
  return path || "/";
}

function navigate(path) {
  window.location.hash = path;
}

function router() {
  if (!DriveStore.isSignedIn()) {
    showAuthGate();
    return;
  }
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

// ── Auth Gate ─────────────────────────────────────────────────────────────

function showAuthGate() {
  elAuthGate.hidden    = false;
  elAppContent.hidden  = true;
  elUserInfo.hidden    = true;
}

function hideAuthGate() {
  elAuthGate.hidden   = true;
  elAppContent.hidden = false;
}

function updateUserUI(userInfo) {
  elUserInfo.hidden = false;
  elUserName.textContent = userInfo?.name || userInfo?.email || "משתמש";
  if (userInfo?.picture) {
    elUserAvatar.src    = userInfo.picture;
    elUserAvatar.hidden = false;
  } else {
    elUserAvatar.hidden = true;
  }
}

// ── Home Page ─────────────────────────────────────────────────────────────

function renderHome() {
  hideAuthGate();
  elAppContent.innerHTML = `
    <h2 class="page-title">חיפוש רכב</h2>
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
    <p style="color:#888;font-size:0.85rem;">
      הקלד את מספר הרישוי (7 או 8 ספרות, עם או בלי מקפים) ולחץ חפש,
      או לחץ על 📷 כדי לזהות לוחית מתמונה.
    </p>
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

// ── Vehicle Page ──────────────────────────────────────────────────────────

async function renderVehicle(rawPlate) {
  hideAuthGate();
  const norm = normalizePlate(rawPlate);
  if (norm.length < 5 || norm.length > 8) {
    navigate("/");
    return;
  }

  elAppContent.innerHTML = `
    <a href="#/" class="btn" style="margin-bottom:1rem;background:#e8eaf6;color:#1a3660;">
      ← חזרה לחיפוש
    </a>
    <div class="card">
      <div class="plate-display" dir="ltr">${escHtml(formatPlate(norm))}</div>
      <h2 class="page-title" style="margin-bottom:0;">פוסטים על הרכב</h2>
    </div>

    <div class="card" id="post-form-card">
      <h3 style="margin-bottom:1rem;color:#1a3660;">פרסם הודעה חדשה</h3>
      <div class="form-group">
        <label for="post-category">קטגוריה</label>
        <select id="post-category">
          <option value="notice">הודעה</option>
          <option value="warning">אזהרה</option>
          <option value="compliment">מחמאה</option>
          <option value="question">שאלה</option>
        </select>
      </div>
      <div class="form-group">
        <label for="post-content">תוכן ההודעה</label>
        <textarea id="post-content" placeholder="כתוב כאן..." maxlength="1000"></textarea>
        <span class="field-error" id="content-error" hidden></span>
      </div>
      <button class="btn btn-primary" id="submit-post-btn">פרסם</button>
    </div>

    <div id="posts-section">
      <div class="loading-row">
        <span class="spinner"></span>
        <span>טוען פוסטים...</span>
      </div>
    </div>
  `;

  // Wire up the submit form
  const submitBtn  = document.getElementById("submit-post-btn");
  const catSelect  = document.getElementById("post-category");
  const contentTA  = document.getElementById("post-content");
  const contentErr = document.getElementById("content-error");
  const formCard   = document.getElementById("post-form-card");

  submitBtn.addEventListener("click", async () => {
    const content = contentTA.value.trim();
    if (!content) {
      contentErr.textContent = "נא להזין תוכן להודעה.";
      contentErr.hidden = false;
      contentTA.focus();
      return;
    }
    contentErr.hidden = true;

    // Disable while saving
    submitBtn.disabled = true;
    submitBtn.textContent = "שומר...";
    clearStatus(formCard);

    try {
      const userInfo = DriveStore.getUserInfo();
      // crypto.randomUUID() requires a secure context (HTTPS or localhost).
      // GitHub Pages always serves over HTTPS, satisfying this requirement.
      const post = {
        id:        crypto.randomUUID(),
        category:  catSelect.value,
        content,
        createdAt: Date.now(),
        author: {
          email: userInfo?.email || "",
          name:  userInfo?.name  || "אנונימי",
        },
      };
      await DriveStore.addVehiclePost(norm, post);
      contentTA.value = "";
      showStatus(formCard, "ההודעה פורסמה בהצלחה!", "success");
      await loadPosts(norm); // refresh the list
    } catch (err) {
      console.error("addVehiclePost error:", err);
      showStatus(formCard, `שגיאה בשמירה: ${err.message}`, "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "פרסם";
    }
  });

  // Load posts
  await loadPosts(norm);
}

async function loadPosts(norm) {
  const section = document.getElementById("posts-section");
  if (!section) return;

  section.innerHTML = `
    <div class="loading-row">
      <span class="spinner"></span>
      <span>טוען פוסטים...</span>
    </div>
  `;

  try {
    const posts = await DriveStore.getVehiclePosts(norm);
    renderPostsList(section, posts, norm);
  } catch (err) {
    console.error("getVehiclePosts error:", err);
    section.innerHTML = `<div class="status-msg status-error">שגיאה בטעינת פוסטים: ${escHtml(err.message)}</div>`;
  }
}

function renderPostsList(container, posts, norm) {
  if (!posts || posts.length === 0) {
    container.innerHTML = `
      <div class="card" style="color:#888;text-align:center;padding:2rem;">
        אין פוסטים עדיין. היה הראשון לפרסם!
      </div>
    `;
    return;
  }

  // Sort newest first (posts from Drive might be unordered from previous sessions)
  const sorted = [...posts].sort((a, b) => b.createdAt - a.createdAt);
  const currentUserEmail = DriveStore.getUserInfo()?.email;

  const items = sorted.map((p) => {
    const catLabel = CATEGORY_LABELS[p.category] || p.category;
    const catClass = CATEGORY_CLASS[p.category] || "";
    const canDelete = p.author?.email && p.author.email === currentUserEmail;

    return `
      <div class="post-item" data-category="${escHtml(p.category)}" data-post-id="${escHtml(p.id)}">
        <div class="post-header">
          <span class="category-badge ${catClass}">${escHtml(catLabel)}</span>
          <span class="post-author">${escHtml(p.author?.name || "אנונימי")}</span>
          <span class="post-date">${escHtml(formatDate(p.createdAt))}</span>
          ${canDelete ? `<button class="btn btn-danger delete-post-btn" data-post-id="${escHtml(p.id)}"
              style="padding:0.1rem 0.5rem;font-size:0.75rem;margin-inline-start:0.5rem;">מחק</button>` : ""}
        </div>
        <div class="post-content">${escHtml(p.content)}</div>
      </div>
    `;
  }).join("");

  container.innerHTML = `<div class="post-list">${items}</div>`;

  // Wire up delete buttons
  container.querySelectorAll(".delete-post-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("האם למחוק פוסט זה?")) return;
      btn.disabled = true;
      try {
        await DriveStore.deleteVehiclePost(norm, btn.dataset.postId);
        await loadPosts(norm);
      } catch (err) {
        console.error("deleteVehiclePost error:", err);
        alert(`שגיאה במחיקה: ${err.message}`);
        btn.disabled = false;
      }
    });
  });
}

// ── About Page ────────────────────────────────────────────────────────────

function renderAbout() {
  hideAuthGate();
  elAppContent.innerHTML = `
    <h2 class="page-title">אודות</h2>
    <div class="card about-section">
      <h3>מה זה?</h3>
      <p>
        "קיר חברתי לבעלי רכב" — אפליקציה ניסיונית המאפשרת לציבור לפרסם הודעות,
        אזהרות, מחמאות ושאלות על מספרי לוחיות רישוי.
      </p>

      <h3>אחסון נתונים</h3>
      <p>
        כל הפוסטים נשמרים ב-Google Drive שלך בתיקיית <strong>AdaniDB</strong>.
        אין שרת מרכזי — הנתונים שלך שייכים לך בלבד.
      </p>

      <h3>הגבלות</h3>
      <ul>
        <li>זהו דמו MVP — לא מוצר מסחרי.</li>
        <li>אין אינטגרציה רשמית עם רשות הרישוי / משרד התחבורה.</li>
        <li>המידע באפליקציה אינו מאומת ואינו בעל תוקף משפטי.</li>
        <li>האפליקציה משתמשת ב-OAuth של Google; סביר שאת/ה מוגדר/ת כ"משתמש בדיקה".</li>
      </ul>

      <h3>פרטיות</h3>
      <p>
        האפליקציה מבקשת גישה ל-Drive רק לתיקיית AdaniDB (scope: <code>drive.file</code>).
        שם המשתמש והמייל שלך נשמרים כמחבר הפוסט בלבד ולא מועברים לשום גורם חיצוני.
      </p>
    </div>
  `;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────

async function bootstrap() {
  elAuthGate   = document.getElementById("auth-gate");
  elAppContent = document.getElementById("app-content");
  elUserInfo   = document.getElementById("user-info");
  elUserName   = document.getElementById("user-name");
  elUserAvatar = document.getElementById("user-avatar");
  elSignoutBtn = document.getElementById("signout-btn");

  // Validate config
  if (!window.APP_CONFIG?.googleClientId ||
      window.APP_CONFIG.googleClientId.includes("YOUR_CLIENT_ID")) {
    elAppContent.hidden = true;
    elAuthGate.innerHTML = `
      <h2>⚙️ הגדרה נדרשת</h2>
      <div class="status-msg status-error" style="max-width:480px;">
        <strong>חסר קובץ docs/config.js</strong><br>
        העתק את <code>docs/config.example.js</code> ל-<code>docs/config.js</code>
        ומלא את ה-<code>googleClientId</code> שלך.<br><br>
        ראה את ה-README להוראות מפורטות.
      </div>
    `;
    elAuthGate.hidden = false;
    return;
  }

  // Init Drive store
  try {
    DriveStore.init({ googleClientId: window.APP_CONFIG.googleClientId });
  } catch (err) {
    elAuthGate.innerHTML = `
      <h2>שגיאת אתחול</h2>
      <p class="status-msg status-error">${escHtml(err.message)}</p>
    `;
    elAuthGate.hidden = false;
    return;
  }

  // Register callbacks
  DriveStore.onSignIn((userInfo) => {
    updateUserUI(userInfo);
    initDbAndRoute();
  });

  DriveStore.onSignOut(() => {
    showAuthGate();
  });

  // Sign-in button
  document.getElementById("signin-btn").addEventListener("click", async () => {
    const btn = document.getElementById("signin-btn");
    btn.disabled = true;
    btn.textContent = "מתחבר...";
    clearStatus(elAuthGate);
    try {
      await DriveStore.signIn();
      // onSignIn callback will handle the rest
    } catch (err) {
      console.error("Sign-in error:", err);
      showStatus(elAuthGate, `שגיאת כניסה: ${err.message}`, "error");
      btn.disabled = false;
      btn.innerHTML = `<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
          alt="Google" width="18" height="18"> היכנס עם Google`;
    }
  });

  // Sign-out button
  elSignoutBtn.addEventListener("click", async () => {
    await DriveStore.signOut();
  });

  // Nav links — about
  document.getElementById("nav-about")?.addEventListener("click", (e) => {
    e.preventDefault();
    navigate("/about");
  });
  document.getElementById("nav-home")?.addEventListener("click", (e) => {
    e.preventDefault();
    navigate("/");
  });

  // Hash routing
  window.addEventListener("hashchange", router);

  // Initial render
  showAuthGate();
}

async function initDbAndRoute() {
  // Show a brief "initializing" message while we set up Drive folders
  elAppContent.innerHTML = `
    <div class="loading-row" style="justify-content:center;margin-top:3rem;">
      <span class="spinner"></span>
      <span>מאתחל את מסד הנתונים...</span>
    </div>
  `;
  elAppContent.hidden = false;
  elAuthGate.hidden   = true;

  try {
    await DriveStore.ensureDb();
  } catch (err) {
    console.error("ensureDb error:", err);
    elAppContent.innerHTML = `
      <div class="status-msg status-error" style="margin-top:2rem;">
        שגיאה באתחול Drive: ${escHtml(err.message)}
      </div>
    `;
    return;
  }

  router();
}

// ── DOMContentLoaded ──────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", bootstrap);

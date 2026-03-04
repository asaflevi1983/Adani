/**
 * Code.gs — Google Apps Script backend for the Car Owners Social Wall.
 *
 * Deploy as a Web App:
 *   Execute as: Me
 *   Who has access: Anyone (no sign-in required)
 *
 * Sheet: "posts" in Spreadsheet ID below.
 * Columns: id | plate | category | content | author | createdAt | hidden
 *
 * GET  ?action=health            → { ok: true }
 * GET  ?action=list&plate=XXXXX  → { ok: true, posts: [...] }
 * GET  ?action=recent            → { ok: true, posts: [...] }
 * POST body (JSON text/plain)    → { ok: true, id: "..." }
 */

var SPREADSHEET_ID   = "1t9tFiBdqYO74K-ysGrR-ButnteVX4qD7RcrFvGbQdQs";
var SHEET_NAME       = "posts";
var HEADERS          = ["id", "plate", "category", "content", "author", "createdAt", "hidden"];
var RECENT_LIMIT     = 20;
var VALID_CATEGORIES = ["notice", "warning", "compliment", "question"];

// ── Sheet helpers ──────────────────────────────────────────────────────────

function getOrCreateSheet() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

function normalizePlate(raw) {
  return String(raw || "").replace(/\D/g, "");
}

/**
 * Convert a data row to a post object using the header index map.
 * Returns null if the row is hidden or has no plate.
 */
function rowToPost(header, row) {
  var iId        = header.indexOf("id");
  var iPlate     = header.indexOf("plate");
  var iCategory  = header.indexOf("category");
  var iContent   = header.indexOf("content");
  var iAuthor    = header.indexOf("author");
  var iCreatedAt = header.indexOf("createdat");
  var iHidden    = header.indexOf("hidden");

  var hidden = iHidden >= 0 ? String(row[iHidden] || "").toLowerCase() : "false";
  if (hidden === "true") return null;

  var plate = iPlate >= 0 ? normalizePlate(row[iPlate]) : "";
  if (!plate) return null;

  return {
    id:        iId        >= 0 ? String(row[iId]        || "") : "",
    plate:     plate,
    category:  iCategory  >= 0 ? String(row[iCategory]  || "notice").toLowerCase() : "notice",
    content:   iContent   >= 0 ? String(row[iContent]   || "") : "",
    author:    iAuthor    >= 0 ? String(row[iAuthor]    || "") : "",
    createdAt: iCreatedAt >= 0 ? String(row[iCreatedAt] || "") : "",
  };
}

function buildHeader(data) {
  return data[0].map(function(h) { return String(h).toLowerCase().trim(); });
}

// ── Query helpers ──────────────────────────────────────────────────────────

function getPostsForPlate(plate) {
  var sheet = getOrCreateSheet();
  var data  = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var header = buildHeader(data);
  var posts  = [];
  for (var r = 1; r < data.length; r++) {
    var post = rowToPost(header, data[r]);
    if (post && post.plate === plate) posts.push(post);
  }
  return posts.reverse(); // newest first
}

function getRecentPosts() {
  var sheet = getOrCreateSheet();
  var data  = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var header = buildHeader(data);
  var posts  = [];
  for (var r = 1; r < data.length; r++) {
    var post = rowToPost(header, data[r]);
    if (post) posts.push(post);
  }
  posts.reverse(); // newest first
  return posts.slice(0, RECENT_LIMIT);
}

// ── HTTP handlers ──────────────────────────────────────────────────────────

function doGet(e) {
  var params = e.parameter || {};
  var action = String(params.action || "");

  if (action === "health") {
    return jsonResponse({ ok: true });
  }

  if (action === "list") {
    var plate = normalizePlate(params.plate || "");
    if (!plate) {
      return jsonResponse({ ok: false, error: "missing plate" });
    }
    return jsonResponse({ ok: true, posts: getPostsForPlate(plate) });
  }

  if (action === "recent") {
    return jsonResponse({ ok: true, posts: getRecentPosts() });
  }

  return jsonResponse({ ok: false, error: "unknown action" });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ ok: false, error: "invalid JSON body" });
  }

  // Validate plate: digits only, exactly 7 or 8 digits
  var plate = normalizePlate(body.plate || "");
  if (plate.length !== 7 && plate.length !== 8) {
    return jsonResponse({ ok: false, error: "invalid plate: must be exactly 7 or 8 digits" });
  }

  // Validate category
  var category = String(body.category || "notice").trim().toLowerCase();
  if (VALID_CATEGORIES.indexOf(category) === -1) category = "notice";

  // Validate content
  var content = String(body.content || "").trim().slice(0, 1000);
  if (!content) {
    return jsonResponse({ ok: false, error: "content is required" });
  }

  var author    = String(body.author || "").trim().slice(0, 100);
  var id        = Utilities.getUuid();
  var createdAt = new Date().toISOString();

  var sheet = getOrCreateSheet();
  sheet.appendRow([id, plate, category, content, author, createdAt, "false"]);

  return jsonResponse({ ok: true, id: id });
}

// ── Response helper ────────────────────────────────────────────────────────

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

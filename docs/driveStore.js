/**
 * driveStore.js
 * Google Drive authentication and CRUD operations.
 *
 * Auth strategy: Google Identity Services (GIS) "token" (implicit) flow.
 * We request an OAuth 2.0 access token directly in the browser — no backend needed.
 * Access tokens expire after 1 hour; we re-request when the token is missing or expired.
 *
 * Drive layout:
 *   AdaniDB/            ← top-level folder in the user's Drive
 *     vehicles/         ← sub-folder
 *       1234567.json    ← one file per plate (normalized digits only)
 *
 * File content example:
 *   { "plate": "1234567", "posts": [ { id, category, content, createdAt, author } ] }
 */

"use strict";

const DriveStore = (() => {
  // ── Constants ──────────────────────────────────────────────────────────────
  const DRIVE_API   = "https://www.googleapis.com/drive/v3";
  const UPLOAD_API  = "https://www.googleapis.com/upload/drive/v3";
  const DB_FOLDER   = "AdaniDB";
  const VEH_FOLDER  = "vehicles";
  const SCOPES      = "https://www.googleapis.com/auth/drive.file";

  // ── State ──────────────────────────────────────────────────────────────────
  let _tokenClient  = null;   // GIS TokenClient
  let _accessToken  = null;   // current access token string
  let _tokenExpiry  = 0;      // epoch ms when token expires
  let _userInfo     = null;   // { email, name, picture }
  let _dbFolderId   = null;   // Google Drive folder id for AdaniDB
  let _vehFolderId  = null;   // Google Drive folder id for AdaniDB/vehicles

  // Callbacks registered by the app layer
  let _onSignIn     = null;
  let _onSignOut    = null;

  // ── Internal helpers ───────────────────────────────────────────────────────

  /**
   * Returns true when we have a valid, non-expired access token.
   */
  function _hasValidToken() {
    return !!_accessToken && Date.now() < _tokenExpiry - 30_000; // 30 s buffer
  }

  /**
   * Fetches the signed-in user's profile from Google.
   * Uses the userinfo endpoint which is always available when we have a token.
   */
  async function _fetchUserInfo() {
    try {
      const resp = await fetch(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        { headers: { Authorization: `Bearer ${_accessToken}` } }
      );
      if (!resp.ok) return null;
      const data = await resp.json();
      return {
        email:   data.email   || "",
        name:    data.name    || data.email || "משתמש",
        picture: data.picture || null,
      };
    } catch {
      return null;
    }
  }

  /**
   * Low-level Drive API GET with auto JSON parsing.
   * Throws on HTTP errors.
   */
  async function _driveGet(path, params = {}) {
    _assertToken();
    const url = new URL(`${DRIVE_API}${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Drive GET ${path} failed (${resp.status}): ${err}`);
    }
    return resp.json();
  }

  /**
   * Low-level Drive API POST/PATCH for metadata + body (multipart).
   * Used for file creation and update (media upload).
   */
  async function _driveMultipart(method, path, metadata, bodyText) {
    _assertToken();
    const boundary = "adani_boundary_" + Math.random().toString(36).slice(2);
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      bodyText,
      `--${boundary}--`,
    ].join("\r\n");

    const url = new URL(`${UPLOAD_API}${path}`);
    url.searchParams.set("uploadType", "multipart");

    const resp = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${_accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Drive ${method} ${path} failed (${resp.status}): ${err}`);
    }
    return resp.json();
  }

  function _assertToken() {
    if (!_hasValidToken()) throw new Error("No valid access token. Please sign in.");
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * init(config)
   * Must be called once after GIS script has loaded.
   * config: { googleClientId }
   */
  function init({ googleClientId }) {
    if (!window.google?.accounts?.oauth2) {
      throw new Error("Google Identity Services script not loaded.");
    }
    _tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: SCOPES,
      // callback is set per-request below
    });
  }

  /**
   * signIn()
   * Opens the Google token popup and resolves with the user info on success.
   * Rejects on error or user cancellation.
   */
  function signIn() {
    return new Promise((resolve, reject) => {
      if (!_tokenClient) {
        return reject(new Error("DriveStore not initialized. Call init() first."));
      }

      _tokenClient.callback = async (tokenResponse) => {
        if (tokenResponse.error) {
          reject(new Error(`OAuth error: ${tokenResponse.error}`));
          return;
        }
        _accessToken = tokenResponse.access_token;
        // GIS tokens typically last 3600 s
        _tokenExpiry = Date.now() + (tokenResponse.expires_in || 3600) * 1000;

        _userInfo = await _fetchUserInfo();
        if (_onSignIn) _onSignIn(_userInfo);
        resolve(_userInfo);
      };

      _tokenClient.requestAccessToken({ prompt: "select_account" });
    });
  }

  /**
   * signOut()
   * Revokes the current token and clears local state.
   */
  async function signOut() {
    if (_accessToken) {
      // Best-effort revoke
      try {
        window.google.accounts.oauth2.revoke(_accessToken, () => {});
      } catch { /* ignore */ }
      _accessToken = null;
      _tokenExpiry = 0;
    }
    _userInfo     = null;
    _dbFolderId   = null;
    _vehFolderId  = null;
    if (_onSignOut) _onSignOut();
  }

  /**
   * isSignedIn() → bool
   */
  function isSignedIn() {
    return _hasValidToken();
  }

  /**
   * getUserInfo() → { email, name, picture } | null
   */
  function getUserInfo() {
    return _userInfo;
  }

  /**
   * onSignIn(cb) / onSignOut(cb) — register UI callbacks
   */
  function onSignIn(cb)  { _onSignIn  = cb; }
  function onSignOut(cb) { _onSignOut = cb; }

  // ── Drive DB helpers ───────────────────────────────────────────────────────

  /**
   * _findOrCreateFolder(name, parentId?)
   * Searches Drive for a folder with the given name (and optional parent).
   * Creates it if not found.
   */
  async function _findOrCreateFolder(name, parentId = null) {
    // Escape single quotes in name for the Drive query string.
    // Note: callers only pass the hardcoded constants DB_FOLDER and VEH_FOLDER,
    // but we escape defensively in case usage expands in the future.
    const escapedName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    // Build query
    let q = `mimeType='application/vnd.google-apps.folder' and name='${escapedName}' and trashed=false`;
    if (parentId) q += ` and '${parentId}' in parents`;

    const result = await _driveGet("/files", { q, fields: "files(id,name)", pageSize: 1 });
    if (result.files.length > 0) return result.files[0].id;

    // Create
    const metadata = {
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
    };
    const resp = await fetch(`${DRIVE_API}/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${_accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metadata),
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Failed to create Drive folder "${name}": ${err}`);
    }
    const created = await resp.json();
    return created.id;
  }

  /**
   * ensureDb()
   * Idempotent: finds or creates AdaniDB/vehicles folders in Drive.
   * Must be called after sign-in before any read/write operations.
   */
  async function ensureDb() {
    _assertToken();
    if (_dbFolderId && _vehFolderId) return; // already initialized
    _dbFolderId  = await _findOrCreateFolder(DB_FOLDER);
    _vehFolderId = await _findOrCreateFolder(VEH_FOLDER, _dbFolderId);
  }

  /**
   * _normalizePlate(plate)
   * Strips everything except digits; used as the filename key.
   */
  function _normalizePlate(plate) {
    return String(plate).replace(/\D/g, "");
  }

  /**
   * _findVehicleFile(normalizedPlate)
   * Returns the Drive file id for <plate>.json, or null if not found.
   */
  async function _findVehicleFile(normalizedPlate) {
    // normalizedPlate is guaranteed digits-only by _normalizePlate(), so no
    // special escaping is needed, but we assert the invariant defensively.
    if (!/^\d+$/.test(normalizedPlate)) throw new Error("Invalid normalized plate.");
    const q = `name='${normalizedPlate}.json' and '${_vehFolderId}' in parents and trashed=false`;
    const result = await _driveGet("/files", { q, fields: "files(id,name)", pageSize: 1 });
    return result.files.length > 0 ? result.files[0].id : null;
  }

  /**
   * getVehiclePosts(plate)
   * Returns the posts array for the given plate.
   * Returns [] if the file doesn't exist yet.
   */
  async function getVehiclePosts(plate) {
    if (!_vehFolderId) throw new Error("DB not initialized. Call ensureDb() first.");
    const norm = _normalizePlate(plate);
    const fileId = await _findVehicleFile(norm);
    if (!fileId) return [];

    const resp = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${_accessToken}` },
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Failed to read vehicle file (${resp.status}): ${err}`);
    }
    const data = await resp.json();
    return Array.isArray(data.posts) ? data.posts : [];
  }

  /**
   * addVehiclePost(plate, post)
   * Appends a post to the vehicle's JSON file (read-modify-write).
   * post: { id, category, content, createdAt, author }
   */
  async function addVehiclePost(plate, post) {
    if (!_vehFolderId) throw new Error("DB not initialized. Call ensureDb() first.");
    const norm = _normalizePlate(plate);
    const fileId = await _findVehicleFile(norm);

    if (!fileId) {
      // Create new file
      const data = { plate: norm, posts: [post] };
      await _driveMultipart(
        "POST",
        "/files",
        { name: `${norm}.json`, parents: [_vehFolderId] },
        JSON.stringify(data)
      );
    } else {
      // Read existing, then update
      const existing = await getVehiclePosts(plate);
      existing.unshift(post); // newest first
      const data = { plate: norm, posts: existing };

      await _driveMultipart(
        "PATCH",
        `/files/${fileId}`,
        { name: `${norm}.json` },
        JSON.stringify(data)
      );
    }
  }

  /**
   * deleteVehiclePost(plate, postId)
   * Removes a post from the vehicle's JSON file if the author email matches the signed-in user.
   */
  async function deleteVehiclePost(plate, postId) {
    if (!_vehFolderId) throw new Error("DB not initialized. Call ensureDb() first.");
    const norm = _normalizePlate(plate);
    const fileId = await _findVehicleFile(norm);
    if (!fileId) return;

    const existing = await getVehiclePosts(plate);
    const currentUser = _userInfo?.email;
    const filtered = existing.filter(
      (p) => !(p.id === postId && p.author?.email === currentUser)
    );
    if (filtered.length === existing.length) return; // nothing removed

    const data = { plate: norm, posts: filtered };
    await _driveMultipart(
      "PATCH",
      `/files/${fileId}`,
      { name: `${norm}.json` },
      JSON.stringify(data)
    );
  }

  // ── Expose public surface ──────────────────────────────────────────────────
  return {
    init,
    signIn,
    signOut,
    isSignedIn,
    getUserInfo,
    onSignIn,
    onSignOut,
    ensureDb,
    getVehiclePosts,
    addVehiclePost,
    deleteVehiclePost,
  };
})();

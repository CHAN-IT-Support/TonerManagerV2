import express from 'express';
import cors from 'cors';
import multer from 'multer';
import Database from 'better-sqlite3';
import { parse } from 'csv-parse/sync';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const app = express();

const getSetting = (key, fallback) => {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch (error) {
    return row.value ?? fallback;
  }
};

const setSetting = (key, value) => {
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const dataDir = process.env.DATA_DIR || path.join(rootDir, 'data');
const uploadsDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const dbPath = path.join(dataDir, 'toner.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

const entraEnabled = Boolean(process.env.AAD_TENANT_ID && process.env.AAD_CLIENT_ID);
const localAuthEnabled = process.env.LOCAL_AUTH_ENABLED !== 'false';
const tenantId = process.env.AAD_TENANT_ID;
const clientId = process.env.AAD_CLIENT_ID;
const clientSecret = process.env.AAD_CLIENT_SECRET;
const redirectUri = process.env.AAD_REDIRECT_URI || 'http://localhost:3000/api/auth/callback';
const issuer = entraEnabled ? `https://login.microsoftonline.com/${tenantId}/v2.0` : null;
const jwks = entraEnabled
  ? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`))
  : null;
const sessionCookieName = 'tm_session';
const sessionDurationMs = 8 * 60 * 60 * 1000;

const seedDir = process.env.SEED_DIR || path.resolve(rootDir, 'sampleDataDB');

const toInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ensureColumn = (table, column, definition) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  if (!columns.includes(column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${definition}`).run();
  }
};

const entityConfigs = {
  locations: {
    table: 'locations',
    fields: ['name'],
    defaults: { name: '' }
  },
  toners: {
    table: 'toners',
    fields: ['model', 'name', 'color', 'stock', 'image_url'],
    defaults: { model: '', name: '', color: 'schwarz', stock: 0, image_url: '' }
  },
  printers: {
    table: 'printers',
    fields: ['name', 'printer_model_id', 'location_id'],
    defaults: { name: '', printer_model_id: null, location_id: null }
  },
  manufacturers: {
    table: 'manufacturers',
    fields: ['name', 'logo_url'],
    defaults: { name: '', logo_url: '' }
  },
  'printer-models': {
    table: 'printer_models',
    fields: ['name', 'manufacturer_id', 'toner_ids', 'image_url'],
    jsonFields: ['toner_ids'],
    defaults: { name: '', manufacturer_id: null, toner_ids: [], image_url: '' }
  },
  cabinets: {
    table: 'cabinets',
    fields: ['name', 'rows', 'columns', 'location_id'],
    defaults: { name: '', rows: 4, columns: 6, location_id: null }
  },
  'shelf-positions': {
    table: 'shelf_positions',
    fields: ['cabinet_id', 'row', 'column', 'toner_id'],
    defaults: { cabinet_id: null, row: 0, column: 0, toner_id: null }
  },
  'toner-location-settings': {
    table: 'toner_location_settings',
    fields: ['toner_id', 'location_id', 'min_stock'],
    defaults: { toner_id: null, location_id: null, min_stock: 0 }
  }
};

const parseRow = (config, row) => {
  if (!row) return row;
  const parsed = { ...row };
  if (config.jsonFields?.includes('toner_ids')) {
    if (!row.toner_ids) {
      parsed.toner_ids = [];
    } else {
      try {
        parsed.toner_ids = JSON.parse(row.toner_ids);
      } catch (error) {
        parsed.toner_ids = [];
      }
    }
  }
  return parsed;
};

const normalizeForDb = (config, payload, mode = 'update') => {
  const data = { ...payload };
  if (config.jsonFields?.includes('toner_ids')) {
    if (typeof data.toner_ids === 'string') {
      try {
        const parsed = JSON.parse(data.toner_ids);
        data.toner_ids = Array.isArray(parsed) ? parsed : [parsed];
      } catch (error) {
        data.toner_ids = data.toner_ids ? [data.toner_ids] : [];
      }
    } else if (!Array.isArray(data.toner_ids)) {
      data.toner_ids = data.toner_ids ? [data.toner_ids] : [];
    }
    data.toner_ids = JSON.stringify(data.toner_ids);
  }
  if ('stock' in data) data.stock = toInt(data.stock, 0);
  if ('rows' in data) data.rows = toInt(data.rows, 4);
  if ('columns' in data) data.columns = toInt(data.columns, 6);
  if ('row' in data) data.row = toInt(data.row, 0);
  if ('column' in data) data.column = toInt(data.column, 0);
  if ('min_stock' in data) data.min_stock = toInt(data.min_stock, 0);
  if (mode === 'create') {
    const merged = { ...config.defaults, ...data };
    if (config.jsonFields?.includes('toner_ids') && !merged.toner_ids) {
      merged.toner_ids = JSON.stringify([]);
    }
    return merged;
  }
  return data;
};

const getBearerToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  return null;
};

const normalizeRoles = (payload) => {
  const roles = payload?.roles || [];
  if (Array.isArray(roles)) {
    return roles.map((role) => String(role).toLowerCase());
  }
  if (roles) {
    return [String(roles).toLowerCase()];
  }
  return [];
};

const mapUserFromToken = (payload) => {
  const roles = normalizeRoles(payload);
  return {
    id: payload?.oid || payload?.sub || null,
    full_name: payload?.name || null,
    email: payload?.preferred_username || payload?.upn || payload?.email || null,
    roles,
    role: roles.includes('admin') ? 'admin' : roles.includes('user') ? 'user' : 'user'
  };
};

const verifyEntraToken = async (token) => {
  if (!entraEnabled) return null;
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience: clientId
  });
  return payload;
};

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const digest = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  return `${salt}:${digest}`;
};

const verifyPassword = (password, hash) => {
  if (!hash) return false;
  const [salt, digest] = hash.split(':');
  if (!salt || !digest) return false;
  const candidate = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(candidate, 'hex'));
};

const parseCookies = (req) => {
  const header = req.headers.cookie || '';
  return header.split(';').reduce((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
};

const buildCookie = (name, value, options = {}) => {
  const segments = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) segments.push(`Max-Age=${options.maxAge}`);
  segments.push('Path=/');
  if (options.httpOnly !== false) segments.push('HttpOnly');
  segments.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.secure) segments.push('Secure');
  return segments.join('; ');
};

const setSessionCookie = (res, sessionId) => {
  const secure = process.env.COOKIE_SECURE === 'true';
  res.setHeader('Set-Cookie', buildCookie(sessionCookieName, sessionId, {
    maxAge: Math.floor(sessionDurationMs / 1000),
    secure
  }));
};

const clearSessionCookie = (res) => {
  const secure = process.env.COOKIE_SECURE === 'true';
  res.setHeader('Set-Cookie', buildCookie(sessionCookieName, '', {
    maxAge: 0,
    secure
  }));
};

const createSession = (user) => {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + sessionDurationMs).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, email, role, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(sessionId, user.id, user.email, user.role, expiresAt);
  return sessionId;
};

const getSessionUser = (sessionId) => {
  if (!sessionId) return null;
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }
  return {
    id: row.user_id,
    email: row.email,
    full_name: row.email,
    role: row.role,
    roles: [row.role]
  };
};

const authOptional = async (req, res, next) => {
  const cookies = parseCookies(req);
  const sessionId = cookies[sessionCookieName];
  const sessionUser = getSessionUser(sessionId);
  if (sessionUser) {
    req.user = sessionUser;
    next();
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    req.user = null;
    next();
    return;
  }

  try {
    let payload = null;
    if (entraEnabled) {
      payload = await verifyEntraToken(token);
    }
    if (!payload) {
      req.user = null;
      next();
      return;
    }
    req.user = mapUserFromToken(payload);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (!req.user.roles?.includes('admin')) {
    res.status(403).json({ error: 'Admin role required' });
    return;
  }
  next();
};

const requireAuth = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
};

const loadCsv = (filenames) => {
  const fileList = Array.isArray(filenames) ? filenames : [filenames];
  const filePath = fileList
    .map((filename) => path.join(seedDir, filename))
    .find((candidate) => fs.existsSync(candidate));
  if (!filePath) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true
  });
};

const insertRows = (table, fields, rows) => {
  if (!rows.length) return;
  const placeholders = fields.map(() => '?').join(', ');
  const stmt = db.prepare(`INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`);
  const insertMany = db.transaction((records) => {
    for (const record of records) {
      stmt.run(fields.map((field) => record[field]));
    }
  });
  insertMany(rows);
};

const seedIfEmpty = () => {
  if (!fs.existsSync(seedDir)) {
    console.warn(`Seed directory not found: ${seedDir}`);
    return;
  }

  const locationCount = db.prepare('SELECT COUNT(*) as count FROM locations').get().count;
  if (locationCount === 0) {
    const locations = loadCsv('Location.csv').map((row) => ({
      id: row.id,
      name: row.name || row.location || 'Standort'
    }));
    if (locations.length === 0) {
      locations.push({ id: crypto.randomUUID(), name: 'Standort A' });
    }
    insertRows('locations', ['id', 'name'], locations);
  }

  const defaultLocationId = db.prepare('SELECT id FROM locations ORDER BY name ASC LIMIT 1').get()?.id || null;

  const manufacturerCount = db.prepare('SELECT COUNT(*) as count FROM manufacturers').get().count;
  if (manufacturerCount === 0) {
  const manufacturers = loadCsv('Manufacturer.csv').map((row) => ({
      id: row.id,
      name: row.name || '',
      logo_url: row.logo_url || null
    }));
    insertRows('manufacturers', ['id', 'name', 'logo_url'], manufacturers);
  }

  const tonerCount = db.prepare('SELECT COUNT(*) as count FROM toners').get().count;
  if (tonerCount === 0) {
    const toners = loadCsv('Toner.csv').map((row) => ({
      id: row.id,
      model: row.model || '',
      name: row.name || '',
      color: row.color || 'schwarz',
      stock: 0,
      image_url: row.image_url || null
    }));
    insertRows('toners', ['id', 'model', 'name', 'color', 'stock', 'image_url'], toners);
  }

  const printerModelCount = db.prepare('SELECT COUNT(*) as count FROM printer_models').get().count;
  if (printerModelCount === 0) {
    const printerModels = loadCsv('PrinterModel.csv').map((row) => ({
      id: row.id,
      name: row.name || '',
      manufacturer_id: row.manufacturer_id || null,
      toner_ids: row.toner_ids ? row.toner_ids : JSON.stringify([]),
      image_url: row.image_url || null
    }));
    insertRows('printer_models', ['id', 'name', 'manufacturer_id', 'toner_ids', 'image_url'], printerModels);
  }

  const printerCount = db.prepare('SELECT COUNT(*) as count FROM printers').get().count;
  if (printerCount === 0) {
    const printerRows = loadCsv('Printer.csv');
    if (printerRows.length > 0) {
      const printers = printerRows.map((row) => ({
        id: row.id,
        name: row.name || 'Drucker',
        printer_model_id: row.printer_model_id || null,
        location_id: row.location_id || defaultLocationId
      }));
      insertRows('printers', ['id', 'name', 'printer_model_id', 'location_id'], printers);
    } else {
      const models = db.prepare('SELECT id, name FROM printer_models').all();
      const printers = models.map((model) => ({
        id: model.id,
        name: model.name || 'Drucker',
        printer_model_id: model.id,
        location_id: defaultLocationId
      }));
      insertRows('printers', ['id', 'name', 'printer_model_id', 'location_id'], printers);
    }
  }

  const cabinetCount = db.prepare('SELECT COUNT(*) as count FROM cabinets').get().count;
  if (cabinetCount === 0) {
    const cabinets = loadCsv('Cabinet.csv').map((row) => ({
      id: row.id,
      name: row.name || '',
      rows: toInt(row.rows, 4),
      columns: toInt(row.columns, 6),
      location_id: row.location_id || defaultLocationId
    }));
    insertRows('cabinets', ['id', 'name', 'rows', 'columns', 'location_id'], cabinets);
  }

  // Intentionally skip seeding shelf positions on first init
};

const migrate = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS toners (
      id TEXT PRIMARY KEY,
      model TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT 'schwarz',
      stock INTEGER NOT NULL DEFAULT 0,
      image_url TEXT
    );

    CREATE TABLE IF NOT EXISTS manufacturers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      logo_url TEXT
    );

    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS printer_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      manufacturer_id TEXT,
      toner_ids TEXT,
      image_url TEXT
    );

    CREATE TABLE IF NOT EXISTS printers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      printer_model_id TEXT,
      location_id TEXT
    );

    CREATE TABLE IF NOT EXISTS cabinets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      rows INTEGER NOT NULL DEFAULT 4,
      columns INTEGER NOT NULL DEFAULT 6,
      location_id TEXT
    );

    CREATE TABLE IF NOT EXISTS shelf_positions (
      id TEXT PRIMARY KEY,
      cabinet_id TEXT,
      row INTEGER NOT NULL DEFAULT 0,
      column INTEGER NOT NULL DEFAULT 0,
      toner_id TEXT
    );

    CREATE TABLE IF NOT EXISTS toner_location_settings (
      id TEXT PRIMARY KEY,
      toner_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      min_stock INTEGER NOT NULL DEFAULT 0,
      UNIQUE(toner_id, location_id)
    );

    CREATE TABLE IF NOT EXISTS app_logs (
      id TEXT PRIMARY KEY,
      page_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_states (
      state TEXT PRIMARY KEY,
      nonce TEXT NOT NULL,
      return_to TEXT,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  ensureColumn('printers', 'location_id', 'location_id TEXT');
  ensureColumn('cabinets', 'location_id', 'location_id TEXT');

  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(id, 'admin@local', hashPassword('admin'), 'admin');
  }

  db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)')
    .run('require_auth_for_stock', JSON.stringify(false));

  seedIfEmpty();

  const cabinetCount = db.prepare('SELECT COUNT(*) as count FROM cabinets').get().count;
  if (cabinetCount === 0) {
    const id = crypto.randomUUID();
    const locationId = db.prepare('SELECT id FROM locations ORDER BY name ASC LIMIT 1').get()?.id || null;
    db.prepare('INSERT INTO cabinets (id, name, rows, columns, location_id) VALUES (?, ?, ?, ?, ?)')
      .run(id, 'Schrank A', 4, 6, locationId);
  }

  const fallbackLocationId = db.prepare('SELECT id FROM locations ORDER BY name ASC LIMIT 1').get()?.id || null;
  if (fallbackLocationId) {
    db.prepare('UPDATE printers SET location_id = ? WHERE location_id IS NULL').run(fallbackLocationId);
    db.prepare('UPDATE cabinets SET location_id = ? WHERE location_id IS NULL').run(fallbackLocationId);
  }
};

migrate();

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : true;

app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(authOptional);

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  })
});

app.use('/uploads', express.static(uploadsDir));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/public-settings', (req, res) => {
  res.json({});
});

app.get('/api/settings', requireAdmin, (req, res) => {
  res.json({
    require_auth_for_stock: Boolean(getSetting('require_auth_for_stock', false))
  });
});

app.put('/api/settings', requireAdmin, (req, res) => {
  const { require_auth_for_stock } = req.body || {};
  if (typeof require_auth_for_stock !== 'undefined') {
    setSetting('require_auth_for_stock', Boolean(require_auth_for_stock));
  }
  res.json({
    require_auth_for_stock: Boolean(getSetting('require_auth_for_stock', false))
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  res.json(req.user);
});

app.get('/api/auth/login', (req, res) => {
  if (!entraEnabled || !clientSecret) {
    res.status(404).send('Entra auth not configured');
    return;
  }
  const loginHint = req.query.login_hint || '';
  const returnTo = req.query.return_to || '/';
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO auth_states (state, nonce, return_to, expires_at) VALUES (?, ?, ?, ?)')
    .run(state, nonce, returnTo, expiresAt);

  const authorizeUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('response_mode', 'query');
  authorizeUrl.searchParams.set('scope', 'openid profile email');
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('nonce', nonce);
  if (loginHint) {
    authorizeUrl.searchParams.set('login_hint', loginHint);
  }

  res.redirect(authorizeUrl.toString());
});

app.get('/api/auth/callback', async (req, res) => {
  if (!entraEnabled || !clientSecret) {
    res.status(404).send('Entra auth not configured');
    return;
  }
  const { code, state } = req.query;
  if (!code || !state) {
    res.status(400).send('Missing code or state');
    return;
  }
  const stateRow = db.prepare('SELECT * FROM auth_states WHERE state = ?').get(state);
  if (!stateRow) {
    res.status(400).send('Invalid state');
    return;
  }
  db.prepare('DELETE FROM auth_states WHERE state = ?').run(state);
  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    res.status(400).send('State expired');
    return;
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: String(code),
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    scope: 'openid profile email'
  });

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text();
    res.status(400).send(text);
    return;
  }

  const tokenData = await tokenResponse.json();
  const idToken = tokenData.id_token;
  if (!idToken) {
    res.status(400).send('Missing id_token');
    return;
  }

  const { payload } = await jwtVerify(idToken, jwks, {
    issuer,
    audience: clientId
  });

  if (payload.nonce !== stateRow.nonce) {
    res.status(400).send('Invalid nonce');
    return;
  }

  const user = mapUserFromToken(payload);
  const sessionId = createSession(user);
  setSessionCookie(res, sessionId);
  res.redirect(stateRow.return_to || '/');
});

app.post('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req);
  const sessionId = cookies[sessionCookieName];
  if (sessionId) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.post('/api/local-auth/login', async (req, res) => {
  if (!localAuthEnabled) {
    res.status(404).json({ error: 'Local auth disabled' });
    return;
  }
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: 'Missing credentials' });
    return;
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  if (!userRow || !verifyPassword(password, userRow.password_hash)) {
    res.status(401).json({ error: 'Ungültige Zugangsdaten' });
    return;
  }
  const user = {
    id: userRow.id,
    full_name: userRow.email,
    email: userRow.email,
    roles: [userRow.role],
    role: userRow.role
  };
  const sessionId = createSession(user);
  setSessionCookie(res, sessionId);
  res.json({ user });
});

app.get('/api/users', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, email, role FROM users ORDER BY email ASC').all();
  res.json(users);
});

app.post('/api/users', requireAdmin, (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ error: 'E-Mail und Passwort sind erforderlich' });
    return;
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedRole = String(role || 'user').trim().toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: 'Benutzer existiert bereits' });
    return;
  }
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(id, normalizedEmail, hashPassword(password), normalizedRole);
  res.status(201).json({ id, email: normalizedEmail, role: normalizedRole });
});

app.put('/api/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { role, password } = req.body || {};
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!userRow) {
    res.status(404).json({ error: 'User nicht gefunden' });
    return;
  }

  const updates = [];
  const values = [];

  if (role) {
    const normalizedRole = String(role).trim().toLowerCase();
    if (userRow.role === 'admin' && normalizedRole !== 'admin') {
      const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin').count;
      if (adminCount <= 1) {
        res.status(400).json({ error: 'Mindestens ein Admin muss bleiben' });
        return;
      }
    }
    updates.push('role = ?');
    values.push(normalizedRole);
  }

  if (password) {
    updates.push('password_hash = ?');
    values.push(hashPassword(password));
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'Keine Änderungen angegeben' });
    return;
  }

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run([...values, id]);
  const updated = db.prepare('SELECT id, email, role FROM users WHERE id = ?').get(id);
  res.json(updated);
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
  if (!user) {
    res.status(404).json({ error: 'User nicht gefunden' });
    return;
  }
  if (user.role === 'admin') {
    const adminCount = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin').count;
    if (adminCount <= 1) {
      res.status(400).json({ error: 'Mindestens ein Admin muss bleiben' });
      return;
    }
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

app.post('/api/app-logs', (req, res) => {
  const id = crypto.randomUUID();
  const pageName = req.body?.page_name || 'unknown';
  db.prepare('INSERT INTO app_logs (id, page_name, created_at) VALUES (?, ?, ?)')
    .run(id, pageName, new Date().toISOString());
  res.json({ ok: true });
});

app.post('/api/uploads', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file provided' });
    return;
  }
  res.json({ file_url: `/uploads/${req.file.filename}` });
});

app.get('/api/:entity', (req, res) => {
  const config = entityConfigs[req.params.entity];
  if (!config) {
    res.status(404).json({ error: 'Unknown entity' });
    return;
  }
  const rows = db.prepare(`SELECT * FROM ${config.table}`).all();
  res.json(rows.map((row) => parseRow(config, row)));
});

app.post('/api/:entity', (req, res, next) => {
  const entity = req.params.entity;
  if (entity === 'shelf-positions') {
    return requireAuth(req, res, next);
  }
  return requireAdmin(req, res, next);
}, (req, res) => {
  const config = entityConfigs[req.params.entity];
  if (!config) {
    res.status(404).json({ error: 'Unknown entity' });
    return;
  }
  const id = req.body?.id || crypto.randomUUID();
  const payload = normalizeForDb(config, req.body || {}, 'create');
  const fields = ['id', ...config.fields];
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((field) => (field === 'id' ? id : payload[field]));
  db.prepare(`INSERT INTO ${config.table} (${fields.join(', ')}) VALUES (${placeholders})`).run(values);
  const row = db.prepare(`SELECT * FROM ${config.table} WHERE id = ?`).get(id);
  res.status(201).json(parseRow(config, row));
});

app.put('/api/:entity/:id', (req, res, next) => {
  const entity = req.params.entity;
  if (entity === 'shelf-positions') {
    return requireAuth(req, res, next);
  }
  if (entity === 'toners') {
    const keys = Object.keys(req.body || {});
    const onlyStock = keys.length > 0 && keys.every((key) => key === 'stock');
    if (onlyStock) {
      return next();
    }
  }
  return requireAdmin(req, res, next);
}, (req, res) => {
  const config = entityConfigs[req.params.entity];
  if (!config) {
    res.status(404).json({ error: 'Unknown entity' });
    return;
  }
  const updates = {};
  for (const field of config.fields) {
    if (field in (req.body || {})) {
      updates[field] = req.body[field];
    }
  }
  const normalized = normalizeForDb(config, updates, 'update');
  const updateFields = Object.keys(normalized);
  if (updateFields.length > 0) {
    const setClause = updateFields.map((field) => `${field} = ?`).join(', ');
    const values = updateFields.map((field) => normalized[field]);
    db.prepare(`UPDATE ${config.table} SET ${setClause} WHERE id = ?`).run([...values, req.params.id]);
  }
  const row = db.prepare(`SELECT * FROM ${config.table} WHERE id = ?`).get(req.params.id);
  res.json(parseRow(config, row));
});

const cleanupTonerReferences = (tonerId) => {
  db.prepare('UPDATE shelf_positions SET toner_id = NULL WHERE toner_id = ?').run(tonerId);
  const models = db.prepare('SELECT * FROM printer_models').all();
  for (const model of models) {
    const tonerIds = model.toner_ids ? JSON.parse(model.toner_ids) : [];
    const nextIds = tonerIds.filter((id) => id !== tonerId);
    if (nextIds.length !== tonerIds.length) {
      db.prepare('UPDATE printer_models SET toner_ids = ? WHERE id = ?')
        .run(JSON.stringify(nextIds), model.id);
    }
  }
};

app.delete('/api/:entity/:id', (req, res, next) => {
  const entity = req.params.entity;
  if (entity === 'shelf-positions') {
    return requireAuth(req, res, next);
  }
  return requireAdmin(req, res, next);
}, (req, res) => {
  const config = entityConfigs[req.params.entity];
  if (!config) {
    res.status(404).json({ error: 'Unknown entity' });
    return;
  }
  const { entity, id } = { entity: req.params.entity, id: req.params.id };

  if (entity === 'toners') {
    cleanupTonerReferences(id);
  }
  if (entity === 'printer-models') {
    db.prepare('UPDATE printers SET printer_model_id = NULL WHERE printer_model_id = ?').run(id);
  }
  if (entity === 'manufacturers') {
    db.prepare('UPDATE printer_models SET manufacturer_id = NULL WHERE manufacturer_id = ?').run(id);
  }
  if (entity === 'cabinets') {
    db.prepare('DELETE FROM shelf_positions WHERE cabinet_id = ?').run(id);
  }

  db.prepare(`DELETE FROM ${config.table} WHERE id = ?`).run(id);
  res.json({ ok: true });
});

const distDir = path.join(rootDir, 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

const port = Number.parseInt(process.env.PORT, 10) || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

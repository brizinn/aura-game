const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'server-data');
const INDEX = path.join(ROOT, "index.html");
fs.mkdirSync(DATA_DIR, { recursive: true });

const defaultState = () => ({
  playerName: 'Player', shards: 100, totalRolls: 0, bestAuraIndex: -1,
  inventory: {}, auraMeta: {}, equippedAuraId: null,
  ownedAccessories: [], equippedAccessories: [], ownedUpgrades: [],
  potionsBoughtCount: 0, everEquippedAccessory: false, maxLuckReached: 1,
  claimedQuests: [], activePotions: [], savedAt: Date.now()
});

function validId(id) { return /^[a-zA-Z0-9_-]{8,100}$/.test(id); }
function savePath(id) { return path.join(DATA_DIR, `${id}.json`); }
function readState(id) {
  try { return JSON.parse(fs.readFileSync(savePath(id), 'utf8')); }
  catch { return null; }
}
function sanitizeState(input) {
  const d = defaultState();
  if (!input || typeof input !== 'object') return d;
  const out = { ...d };
  if (typeof input.playerName === 'string') out.playerName = input.playerName.slice(0, 20);
  if (Number.isFinite(input.shards) && input.shards >= 0) out.shards = Math.floor(input.shards);
  if (Number.isFinite(input.totalRolls) && input.totalRolls >= 0) out.totalRolls = Math.floor(input.totalRolls);
  if (Number.isInteger(input.bestAuraIndex)) out.bestAuraIndex = input.bestAuraIndex;
  if (input.inventory && typeof input.inventory === 'object') out.inventory = input.inventory;
  if (input.auraMeta && typeof input.auraMeta === 'object') out.auraMeta = input.auraMeta;
  if (typeof input.equippedAuraId === 'string' || input.equippedAuraId === null) out.equippedAuraId = input.equippedAuraId;
  for (const k of ['ownedAccessories','equippedAccessories','ownedUpgrades','claimedQuests']) if (Array.isArray(input[k])) out[k] = input[k];
  if (Number.isFinite(input.potionsBoughtCount)) out.potionsBoughtCount = Math.floor(input.potionsBoughtCount);
  out.everEquippedAccessory = !!input.everEquippedAccessory;
  if (Number.isFinite(input.maxLuckReached)) out.maxLuckReached = Math.max(1, input.maxLuckReached);
  if (Array.isArray(input.activePotions)) out.activePotions = input.activePotions.slice(0, 20);
  out.savedAt = Date.now();
  return out;
}
function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }); return res.end(); }
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/' || url.pathname === '/index.html') {
    return fs.readFile(INDEX, (err, data) => err ? send(res, 500, 'text/plain; charset=utf-8', 'Game file unavailable') : send(res, 200, 'text/html; charset=utf-8', data));
  }

  const match = url.pathname.match(/^\/api\/state\/([^/]+)$/);
  if (match) {
    const id = match[1];
    if (!validId(id)) return send(res, 400, 'application/json', JSON.stringify({ error: 'Invalid player id' }));
    const file = savePath(id);
    if (req.method === 'GET') {
      const state = readState(id);
      return state ? send(res, 200, 'application/json', JSON.stringify(state)) : send(res, 404, 'application/json', JSON.stringify({ error: 'Save not found' }));
    }
    if (req.method === 'POST') {
      let raw = '';
      req.on('data', chunk => { raw += chunk; if (raw.length > 512000) req.destroy(); });
      req.on('end', () => {
        try {
          const data = sanitizeState(JSON.parse(raw));
          const temp = `${file}.tmp-${crypto.randomBytes(4).toString('hex')}`;
          fs.writeFileSync(temp, JSON.stringify(data, null, 2), 'utf8');
          fs.renameSync(temp, file);
          send(res, 200, 'application/json', JSON.stringify({ ok: true, savedAt: data.savedAt }));
        } catch { send(res, 400, 'application/json', JSON.stringify({ error: 'Invalid save data' })); }
      });
      return;
    }
  }
  send(res, 404, 'text/plain; charset=utf-8', 'Not found');
});

server.listen(PORT, () => console.log(`Brizin's RNG server running at http://localhost:${PORT}`));

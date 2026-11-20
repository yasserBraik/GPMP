// Demo-mode stand-in for the GPMP backend. It answers the website's /api requests from
// sample data recorded from a real GPMP server (demo/data.json, loaded once), so the
// published demo works without any server or database.
//
// - Signing in works with the demo accounts and the demo password.
// - Reading works on every page that was recorded.
// - Changes (create, edit, delete, upload) are refused with a friendly "demo" message.
// Only loaded when IS_DEMO is true (see main.jsx).
import { BASE_URL, DEMO_PASSWORD_HINT } from '../config/demo.js';

const TOKEN_PREFIX = 'demo:';
const READ_ONLY_MESSAGE =
  'This is a read-only demo with sample data, so changes are not saved. Run GPMP on your own computer to try this.';

let dataPromise = null;
function loadData() {
  if (!dataPromise) {
    dataPromise = fetch(`${BASE_URL}demo/data.json`).then((response) => {
      if (!response.ok) throw new Error('Demo data missing');
      return response.text();
    }).then((text) => JSON.parse(text.replaceAll('@BASE@', BASE_URL)));
  }
  return dataPromise;
}

// "/api/tasks?b=2&a=1" -> "/api/tasks?a=1&b=2" (the same key whatever the parameter order),
// without the "v" cache-buster
function normalise(pathAndQuery) {
  const url = new URL(pathAndQuery, 'http://demo');
  const params = [...url.searchParams.entries()].filter(([key]) => key !== 'v').sort(([a], [b]) => a.localeCompare(b));
  const query = new URLSearchParams(params).toString();
  return `${url.pathname}${query ? `?${query}` : ''}`;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
const error = (message, status = 400) => json({ error: { message } }, status);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function userKeyFromHeaders(headers) {
  const auth = new Headers(headers || {}).get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  return token.startsWith(TOKEN_PREFIX) ? token.slice(TOKEN_PREFIX.length) : null;
}

// The recorded answer for a request, or a close match (same address, other filters)
function findRecorded(book, method, key) {
  if (!book) return null;
  if (book[`${method} ${key}`]) return book[`${method} ${key}`];
  const path = key.split('?')[0];
  const sameAddress = Object.keys(book).find((k) => k.split('?')[0] === `${method} ${path}`);
  return sameAddress ? book[sameAddress] : null;
}

// The posters search runs on the recorded list, so any search word works
function searchPosters(recorded, key) {
  const params = new URL(key, 'http://demo').searchParams;
  const word = (params.get('search') || '').toLowerCase();
  const year = params.get('year') || '';
  const posters = recorded.body.posters.filter((p) => {
    const text = `${p.title} ${p.summary || ''} ${p.groupName} ${p.projectTitle || ''}`.toLowerCase();
    return (!word || text.includes(word)) && (!year || p.academicYear === year);
  });
  return json({ ...recorded.body, posters }, recorded.status);
}

async function handle(method, key, init) {
  const data = await loadData();
  await wait(120); // feels like a real server

  // ----- Signing in -----
  if (method === 'POST' && key === '/api/auth/login') {
    const { email = '', password = '' } = JSON.parse(init.body || '{}');
    const userKey = data.accountsByEmail[email.trim().toLowerCase()];
    if (!userKey || password !== DEMO_PASSWORD_HINT) {
      return error(
        userKey ? 'Incorrect email or password.' : 'Use one of the demo accounts listed below the form.',
        401
      );
    }
    return json({ token: `${TOKEN_PREFIX}${userKey}`, user: data.users[userKey].me });
  }
  if (key.startsWith('/api/auth/') && method === 'POST') {
    return error('Password changes and resets are not available in the demo.');
  }

  const userKey = userKeyFromHeaders(init.headers);
  const book = userKey ? data.users[userKey]?.responses : data.public;
  if (userKey && !data.users[userKey]) return error('Please sign in again.', 401);

  // ----- Reading -----
  if (method === 'GET') {
    if (key === '/api/auth/me') return userKey ? json(data.users[userKey].me) : error('Please sign in to continue.', 401);
    const recorded = findRecorded(book, 'GET', key) || (userKey ? null : findRecorded(data.public, 'GET', key));
    if (recorded && key.startsWith('/api/posters?')) return searchPosters(recorded, key);
    if (recorded) return json(recorded.body, recorded.status);
    if (/\/(download|video|image)(\?|$)/.test(key)) return error('Files cannot be downloaded in the demo.', 404);
    return error('This part has no sample data in the demo.', 404);
  }

  // ----- "Mark as read" and similar quiet updates: accept them, nothing changes -----
  if (method === 'PATCH' && /\/read(-all)?$|\/read\?/.test(key)) return json({ message: 'OK (demo)', updated: 0 });

  // ----- AI helpers: answers recorded from the real server -----
  if (method === 'POST' && key.startsWith('/api/ai/')) {
    // Recorded per item: "/api/ai/chat-summary?channel=Group&groupId=1"
    const body = JSON.parse(init.body || '{}');
    const params = Object.entries(body).filter(([name, value]) => name !== 'unread' && name !== 'title' && value !== undefined);
    const itemKey = normalise(`${key}?${new URLSearchParams(params.map(([n, v]) => [n, String(v)])).toString()}`);
    const recorded = book?.[`POST ${itemKey}`] || findRecorded(book, 'POST', key);
    if (recorded) return json(recorded.body, recorded.status);
    return error('The AI helper has no sample answer for this item in the demo.');
  }

  return error(READ_ONLY_MESSAGE, 403);
}

// Replaces window.fetch for /api addresses; everything else goes to the network as usual
export function installMockApi() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const path = new URL(url, window.location.origin).pathname;
    const apiIndex = path.indexOf('/api/');
    if (apiIndex === -1) return realFetch(input, init);
    const query = new URL(url, window.location.origin).search;
    const key = normalise(`${path.slice(apiIndex)}${query}`);
    const method = (init.method || 'GET').toUpperCase();
    try {
      return await handle(method, key, init);
    } catch (err) {
      console.error('[demo]', err);
      return error('The demo data could not be loaded. Please refresh the page.', 503);
    }
  };
}

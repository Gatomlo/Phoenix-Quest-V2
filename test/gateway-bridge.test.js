'use strict';
// Connexion centralisee de node-gateway : req.gateway avec le droit « admin » authentifie la requete comme
// administrateur, a chaque requete et sans session (coupe des que la passerelle ne garantit plus). Un « membre »
// ou un anonyme n'obtiennent rien. Le mot de passe local reste valable. Hors passerelle : inchange.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-gw-'));
process.env.DATA_DIR = dir;
const express = require('express');
const auth = require('../src/auth');
const app = require('../src/server');

let srv, base;
const gw = (role) => ({ 'x-test-gateway': JSON.stringify({ app: 'Phoenix-Quest-V2', role, user: { login: 'anim', name: 'Anim', email: null, isSuper: false } }) });
const me = (headers = {}) => fetch(base + '/api/admin/me', { headers });

test.before(async () => {
  const outer = express();
  outer.use((req, res, next) => { const h = req.get('x-test-gateway'); if (h) req.gateway = JSON.parse(h); next(); });
  outer.use('/Phoenix-Quest-V2', app);
  srv = http.createServer(outer);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}/Phoenix-Quest-V2`;
});
test.after(() => { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); setImmediate(() => process.exit(0)); });

test('droit admin de la passerelle -> acces administrateur, sans cookie', async () => {
  const r = await me(gw('admin'));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('set-cookie'), null);
  assert.equal((await fetch(base + '/api/admin/sessions', { headers: gw('admin') })).status !== 401, true);
});

test('coupe aussitot quand la passerelle ne garantit plus', async () => {
  assert.equal((await me(gw('admin'))).status, 200);
  assert.equal((await me()).status, 401);
});

test('un simple membre, un anonyme ou un droit nul n\'obtiennent rien', async () => {
  for (const h of [gw('member'), gw(null), {}]) assert.equal((await me(h)).status, 401);
});

test('mot de passe local inchange', async () => {
  const pw = 'mot-de-passe-de-test-' + Math.random().toString(36).slice(2);
  auth.setPassword(pw);
  const r = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw }) });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  assert.equal((await me({ cookie })).status, 200);
});

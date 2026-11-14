'use strict';
// Connexion admin : limitation des essais, cookie limite au chemin de montage et Secure en HTTPS.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-sec-'));
process.env.DATA_DIR = dir;
const express = require('express');
const auth = require('../src/auth');
const app = require('../src/server');
const PASSWORD = 'mot-de-passe-de-test-' + Math.random().toString(36).slice(2);
auth.setPassword(PASSWORD);

let srv, base;
test.before(async () => {
  const outer = express();
  outer.use('/Phoenix-Quest-V2', (req, res, next) => { req.gateway = { app: 'Phoenix-Quest-V2', user: null, role: null }; next(); }, app);
  srv = http.createServer(outer);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}/Phoenix-Quest-V2`;
});
test.after(() => { srv.close(); fs.rmSync(dir, { recursive: true, force: true }); setImmediate(() => process.exit(0)); });

const login = (password, headers = {}) => fetch(base + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ password }) });

test('cookie admin : limite au chemin de montage, HttpOnly, Secure en HTTPS', async () => {
  let r = await login(PASSWORD, { 'x-forwarded-for': '203.0.113.5' });
  assert.equal(r.status, 200);
  let c = r.headers.get('set-cookie');
  assert.match(c, /Path=\/Phoenix-Quest-V2\//);
  assert.match(c, /HttpOnly/);
  assert.doesNotMatch(c, /Secure/, 'pas Secure en HTTP');
  r = await login(PASSWORD, { 'x-forwarded-for': '203.0.113.5', 'x-forwarded-proto': 'https' });
  c = r.headers.get('set-cookie');
  assert.match(c, /Secure/);
});

test('limitation des essais : 8 echecs par IP puis 429, meme avec le bon mot de passe', async () => {
  const ip = { 'x-forwarded-for': '198.51.100.9' };
  for (let i = 0; i < 8; i++) assert.equal((await login('faux-' + i, ip)).status, 401);
  assert.equal((await login('encore-faux', ip)).status, 429);
  assert.equal((await login(PASSWORD, ip)).status, 429, 'bloque aussi le bon mot de passe');
  assert.equal((await login(PASSWORD, { 'x-forwarded-for': '192.0.2.77' })).status, 200, 'une autre IP n\'est pas touchee');
});

test('l\'IP ne se falsifie pas en ajoutant un en-tete X-Forwarded-For client (derniere entree retenue)', async () => {
  // le client envoie une fausse IP en premier ; le proxy ajoute la vraie a la fin
  const spoof = (n) => ({ 'x-forwarded-for': `10.0.0.${n}, 198.51.100.50` });
  for (let i = 0; i < 8; i++) assert.equal((await login('faux', spoof(i))).status, 401);
  assert.equal((await login(PASSWORD, spoof(99))).status, 429);
});

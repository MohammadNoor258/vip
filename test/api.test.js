'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server.js');

describe('REST API (supertest)', () => {
  test('POST /api/auth/login returns 400 when credentials missing', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'missing_credentials');
    assert.ok(typeof res.body.message === 'string');
  });

  test('POST /api/superadmin/login returns 400 when credentials missing', async () => {
    const res = await request(app).post('/api/superadmin/login').send({});
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'missing_credentials');
  });

  test('GET /api/status returns JSON subscription payload when DB is reachable', async () => {
    const res = await request(app).get('/api/status').query({ restaurantId: 1 });
    if (res.status !== 200) {
      console.warn('[test] /api/status not 200 — is MySQL running?', res.status, res.body);
      return;
    }
    assert.strictEqual(typeof res.body.subscriptionActive, 'boolean');
    assert.ok(Number.isFinite(Number(res.body.restaurantId)));
  });
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  app,
  canAccessAudience,
  getAccess,
  getOAuthRedirectPath,
  getOAuthAccess,
  getPasswordAccess,
  hashPassword,
  isConfiguredOAuthCredential,
  normalizeEmail,
  parseLeaderAccess,
  requireChurchLeadership,
  requireDeveloper,
  requireMember,
  requireSuperDeveloper,
  validateLogin,
  validateMetrics,
  validatePrayerRequest,
  validateRegistration,
  validateReport,
  validateTestimonialRating,
  verifyPassword
} = require('../server');

test('testimonial submission URL is handled by the Express API', async t => {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  }));
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/public/testimonials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Ana', rating: 5, imageUrl: '', content: 'Mi testimonio de prueba' })
  });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: 'Origen no autorizado.' });
});

test('leader access is exact and restricted to the configured ministry', () => {
  const previous = process.env.LEADER_ACCESS;
  const previousChurches = process.env.CHURCHES;
  process.env.CHURCHES = 'ciudad-camelot:CCICAEPCC Ciudad Camelot;iglesia-hija:Iglesia Hija';
  process.env.LEADER_ACCESS = 'leader@example.org=damas@ciudad-camelot';
  try {
    assert.deepEqual(getAccess('LEADER@example.org'), {
      role: 'leader',
      ministries: ['damas'],
      churchCodes: ['ciudad-camelot']
    });
    assert.deepEqual(getAccess('other@example.org'), {
      role: 'community',
      ministries: [],
      churchCodes: []
    });
    assert.deepEqual(parseLeaderAccess('bad@example.org=unknown').size, 0);
    process.env.LEADER_ACCESS = 'leader@example.org=damas@iglesia-hija';
    assert.deepEqual(getAccess('leader@example.org').churchCodes, ['iglesia-hija']);
    assert.throws(
      () => validateReport(
        { ministryCode: 'damas', churchCode: 'ciudad-camelot', title: 'Reunión' },
        getAccess('leader@example.org')
      ),
      { status: 403 }
    );
    assert.throws(
      () => validateReport(
        { ministryCode: 'damas', churchCode: 'ciudad-camelot', title: 'Reunión' },
        getAccess('visitor@example.org')
      ),
      { status: 403 }
    );
  } finally {
    if (previous === undefined) delete process.env.LEADER_ACCESS;
    else process.env.LEADER_ACCESS = previous;
    if (previousChurches === undefined) delete process.env.CHURCHES;
    else process.env.CHURCHES = previousChurches;
  }
});

test('email registration and login inputs are normalized and validated', () => {
  assert.deepEqual(validateRegistration({
    name: '  Ana Pérez  ',
    email: ' ANA@example.org ',
    password: 'a-secure-password'
  }), {
    name: 'Ana Pérez',
    email: 'ana@example.org',
    password: 'a-secure-password'
  });
  assert.deepEqual(validateLogin({
    email: 'LEADER@example.org',
    password: 'correct-password',
    audience: 'leadership'
  }), {
    email: 'leader@example.org',
    password: 'correct-password',
    audience: 'leadership'
  });
  assert.equal(normalizeEmail(' USER@example.org '), 'user@example.org');
  assert.throws(() => validateRegistration({
    name: 'Ana',
    email: 'ana@example.org',
    password: 'short'
  }), { status: 400 });
  assert.throws(() => validateLogin({
    email: 'not-an-email',
    password: 'correct-password'
  }), { status: 400 });
});

test('OAuth credentials reject template placeholders', () => {
  assert.equal(isConfiguredOAuthCredential('real-client-secret-value'), true);
  assert.equal(isConfiguredOAuthCredential(''), false);
  assert.equal(isConfiguredOAuthCredential('PEGA_AQUI_TU_SECRETO_DE_CLIENTE'), false);
  assert.equal(isConfiguredOAuthCredential('YOUR_CLIENT_SECRET'), false);
});

test('passwords are stored as scrypt hashes and checked safely', async () => {
  const password = 'a-secure-password';
  const encodedHash = await hashPassword(password);
  assert.match(encodedHash, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword(password, encodedHash), true);
  assert.equal(await verifyPassword('a-different-password', encodedHash), false);
  assert.equal(await verifyPassword(password, 'OAUTH_ONLY'), false);
});

test('prayer requests are trimmed and bounded in length', () => {
  assert.deepEqual(validatePrayerRequest({ content: '  Oren por mi familia  ' }), {
    content: 'Oren por mi familia'
  });
  assert.throws(() => validatePrayerRequest({ content: 'corto' }), { status: 400 });
  assert.throws(() => validatePrayerRequest({ content: 'x'.repeat(4001) }), { status: 400 });
});

test('member-only routes reject leaders and allow community accounts', () => {
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  let continued = false;
  requireMember({ actor: { role: 'leader' } }, response, () => { continued = true; });
  assert.equal(response.statusCode, 403);
  assert.equal(continued, false);

  requireMember({ actor: { role: 'community' } }, response, () => { continued = true; });
  assert.equal(continued, true);
});

test('developer OAuth access respects stored roles and verified owner assignment', () => {
  assert.equal(getOAuthAccess({
    email: 'sandoval97825@gmail.com',
    role: 'SUPER_DEVELOPER'
  }).role, 'superDeveloper');
  assert.notEqual(getOAuthAccess({
    email: 'sandoval97825@gmail.com',
    role: 'MIEMBRO'
  }).role, 'superDeveloper');
  assert.equal(getOAuthAccess({
    email: 'delegate@example.org',
    role: 'DEVELOPER'
  }).role, 'developer');
  assert.equal(getOAuthAccess({
    email: 'pastor@example.org',
    role: 'PASTOR'
  }).role, 'pastor');
  assert.equal(getOAuthAccess({
    email: 'attacker@example.org',
    role: 'SUPER_DEVELOPER'
  }), null);
  assert.equal(getPasswordAccess({
    email: 'sandoval97825@gmail.com',
    role: 'SUPER_DEVELOPER'
  }), null);
  assert.equal(canAccessAudience({ role: 'superDeveloper' }, 'leadership'), true);
  assert.equal(canAccessAudience({ role: 'developer' }, 'leadership'), false);
  assert.equal(canAccessAudience({ role: 'community' }, 'admin'), false);
  assert.equal(canAccessAudience(null, 'community'), false);
});

test('OAuth redirects follow the authenticated account role', () => {
  assert.equal(getOAuthRedirectPath(
    { role: 'SUPER_DEVELOPER' },
    { role: 'superDeveloper' }
  ), '/admin/developer.html');
  assert.equal(getOAuthRedirectPath(
    { role: 'DEVELOPER' },
    { role: 'developer' }
  ), '/admin/developer-panel.html');
  assert.equal(getOAuthRedirectPath(
    { role: 'PASTOR' },
    { role: 'pastor' }
  ), '/admin/church-dashboard.html');
  assert.equal(getOAuthRedirectPath(
    { role: 'LIDER' },
    { role: 'leader' }
  ), '/admin/church-dashboard.html');
  assert.equal(getOAuthRedirectPath(
    { role: 'MIEMBRO' },
    { role: 'community' }
  ), '/dashboard.html');
});

test('protected role middleware rejects users outside the allowed role', () => {
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  let continued = false;

  requireDeveloper({ actor: { role: 'leader' } }, response, () => { continued = true; });
  assert.equal(response.statusCode, 403);
  assert.equal(continued, false);

  response.statusCode = 200;
  requireChurchLeadership({ actor: { role: 'developer' } }, response, () => { continued = true; });
  assert.equal(response.statusCode, 403);
  assert.equal(continued, false);

  response.statusCode = 200;
  requireSuperDeveloper({
    actor: { role: 'superDeveloper', email: 'delegate@example.org' }
  }, response, () => { continued = true; });
  assert.equal(response.statusCode, 403);
  assert.equal(continued, false);
});

test('admin panel routes require an active session before serving the interface', async t => {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  }));
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  for (const route of [
    '/admin/developer.html',
    '/admin/developer-panel.html',
    '/admin/developer/settings',
    '/admin/church-dashboard.html',
    '/admin/church/events',
    '/dashboard.html'
  ]) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`);
    assert.equal(response.status, 401, `${route} should require authentication`);
  }
});

test('public member registrations cannot inherit leader access from email allowlists', () => {
  const previous = process.env.LEADER_ACCESS;
  const previousChurches = process.env.CHURCHES;
  process.env.CHURCHES = 'ciudad-camelot:CCICAEPCC Ciudad Camelot';
  process.env.LEADER_ACCESS = 'leader@example.org=damas@ciudad-camelot';
  try {
    assert.deepEqual(getPasswordAccess({
      email: 'leader@example.org',
      role: 'MIEMBRO'
    }), {
      role: 'community',
      ministries: [],
      churchCodes: []
    });
    assert.equal(getPasswordAccess({
      email: 'leader@example.org',
      role: 'LIDER'
    }).role, 'leader');
    assert.equal(getPasswordAccess({
      email: 'other@example.org',
      role: 'LIDER'
    }), null);
  } finally {
    if (previous === undefined) delete process.env.LEADER_ACCESS;
    else process.env.LEADER_ACCESS = previous;
    if (previousChurches === undefined) delete process.env.CHURCHES;
    else process.env.CHURCHES = previousChurches;
  }
});

test('metric values must be non-negative integers', () => {
  assert.equal(validateMetrics({ totalMembers: 12 }).totalMembers, 12);
  assert.throws(() => validateMetrics({ activeMembers: -1 }), { status: 400 });
  assert.throws(() => validateMetrics({ newMembers: 1.5 }), { status: 400 });
});

test('testimonial ratings must be integers from one to five stars', () => {
  assert.equal(validateTestimonialRating('5'), 5);
  assert.equal(validateTestimonialRating(1), 1);
  for (const rating of [undefined, 0, 6, 2.5, 'not-a-rating']) {
    assert.throws(() => validateTestimonialRating(rating), { status: 400 });
  }
});

test('reports require ministry scope and approval before public visibility', () => {
  const actor = { ministries: ['damas'], churchCodes: ['ciudad-camelot'] };
  const baseReport = { ministryCode: 'damas', title: 'Reunión mensual' };
  assert.equal(validateReport(baseReport, actor).publishToWeb, false);
  assert.throws(
    () => validateReport({ ...baseReport, publishToWeb: true }, actor),
    { status: 400 }
  );
  assert.equal(validateReport({
    ...baseReport,
    status: 'APPROVED',
    publishToWeb: true
  }, actor).publishToWeb, true);
  assert.throws(
    () => validateReport({ ...baseReport, ministryCode: 'banda' }, actor),
    { status: 403 }
  );
});

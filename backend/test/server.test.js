const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getAccess,
  parseLeaderAccess,
  validateMetrics,
  validateReport,
  validateTestimonialRating
} = require('../server');

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

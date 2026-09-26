// Railway blocks outbound SMTP on Free/Trial/Hobby plans, and the first real order (2026-09-26)
// hung its customer for two minutes waiting on Gmail. These tests pin the fix: email goes out
// over HTTPS when a Resend key is set, and no mail call can block a request for long.
const { test } = require('node:test');
const assert = require('node:assert');
const { createMailer, resendMailer, withTimeout } = require('../mail.js');

const okFetch = (calls) => async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200, json: async () => ({ id: 're_123' }) }; };

test('a Resend key selects the HTTPS mailer, and it wins over SMTP settings', () => {
  const r = createMailer({ RESEND_API_KEY: 're_key', EMAIL_USER: 'a@gmail.com', EMAIL_PASS: 'x' }, { fetchImpl: okFetch([]) });
  assert.strictEqual(r.kind, 'resend');
  assert.ok(r.mailer && typeof r.mailer.sendMail === 'function');
  assert.match(r.note, /shared sender/, 'warns that an unverified sender only reaches the account owner');
});

test('a verified custom sender is reported as such', () => {
  const r = createMailer({ RESEND_API_KEY: 'k', RESEND_FROM: '2AM <orders@2amcases.online>' }, { fetchImpl: okFetch([]) });
  assert.match(r.note, /custom sender/);
});

test('SMTP settings select SMTP off Railway; on Railway they mean email is OFF, never a mailer that hangs', () => {
  const fakeNodemailer = { createTransport: () => ({ sendMail: async () => ({}) }) };
  const local = createMailer({ EMAIL_USER: 'a@gmail.com', EMAIL_PASS: 'x' }, { nodemailer: fakeNodemailer });
  assert.strictEqual(local.kind, 'smtp');
  assert.ok(local.mailer);
  const railway = createMailer({ EMAIL_USER: 'a@gmail.com', EMAIL_PASS: 'x', RAILWAY_ENVIRONMENT: 'production' }, { nodemailer: fakeNodemailer });
  assert.strictEqual(railway.mailer, null, 'no mailer, so the site cannot claim an email was sent');
  assert.strictEqual(railway.kind, 'blocked');
  assert.match(railway.note, /blocks outbound SMTP on Free\/Trial\/Hobby/);
  const pro = createMailer({ EMAIL_USER: 'a@gmail.com', EMAIL_PASS: 'x', RAILWAY_ENVIRONMENT: 'production', ALLOW_SMTP_ON_RAILWAY: '1' }, { nodemailer: fakeNodemailer });
  assert.strictEqual(pro.kind, 'smtp', 'a Pro plan can opt in');
});

test('nothing configured means no mailer, with a note that says emails will not send', () => {
  const r = createMailer({}, {});
  assert.strictEqual(r.mailer, null);
  assert.strictEqual(r.kind, 'none');
  assert.match(r.note, /will NOT be sent/);
});

test('Resend requests go to the HTTPS API with the key, the configured sender and a reply-to', async () => {
  const calls = [];
  const m = resendMailer({ apiKey: 're_secret', from: '2AM <onboarding@resend.dev>', replyTo: 'chris@example.com', fetchImpl: okFetch(calls) });
  const out = await m.sendMail({ from: 'ignored@gmail.com', to: 'buyer@example.com', subject: 'Hi', text: 'body', html: '<p>body</p>' });
  assert.deepStrictEqual(out, { id: 're_123' });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, 'https://api.resend.com/emails');
  assert.strictEqual(calls[0].opts.method, 'POST');
  assert.strictEqual(calls[0].opts.headers.Authorization, 'Bearer re_secret');
  const body = JSON.parse(calls[0].opts.body);
  assert.strictEqual(body.from, '2AM <onboarding@resend.dev>', 'the caller\'s from is not used: Resend only allows a verified sender');
  assert.deepStrictEqual(body.to, ['buyer@example.com']);
  assert.strictEqual(body.subject, 'Hi'); assert.strictEqual(body.reply_to, 'chris@example.com');
  assert.ok(!JSON.stringify(calls[0]).includes('ignored@gmail.com'));
});

test('a Resend error is surfaced with its message, not swallowed', async () => {
  const f = async () => ({ ok: false, status: 403, json: async () => ({ name: 'validation_error', message: 'You can only send testing emails to your own email address' }) });
  const m = resendMailer({ apiKey: 'k', from: 'f', fetchImpl: f });
  await assert.rejects(m.sendMail({ to: 'x@y.com', subject: 's', text: 't' }), /Resend 403: You can only send testing emails/);
});

test('a mail service that never answers cannot hold a request: the call fails fast instead of hanging', async () => {
  const started = Date.now();
  await assert.rejects(withTimeout(new Promise(() => {}), 40, 'mail'), /timed out after 40 ms/);
  assert.ok(Date.now() - started < 1000, 'returned quickly');
  assert.strictEqual(await withTimeout(Promise.resolve('ok'), 1000, 'mail'), 'ok', 'a fast call is untouched');
});

test('a hung Resend request is cut off by the timeout', async () => {
  const hang = () => new Promise(() => {});
  const m = resendMailer({ apiKey: 'k', from: 'f', fetchImpl: hang });
  const t = Date.now();
  await assert.rejects(Promise.race([m.sendMail({ to: 'x@y.com', subject: 's', text: 't' }), new Promise((_, r) => setTimeout(() => r(new Error('test gave up')), 12000))]), /timed out after 8000 ms/);
  assert.ok(Date.now() - t < 10000);
});

const { verifyResendKey } = require('../mail.js');
const statusFetch = (status) => async () => ({ ok: status < 400, status, json: async () => ({}) });

test('the startup key check: a validation error means the key is real; an auth error means it is not; anything else is unknown', async () => {
  assert.strictEqual((await verifyResendKey({ apiKey: 'k', fetchImpl: statusFetch(422) })).ok, true);
  assert.strictEqual((await verifyResendKey({ apiKey: 'k', fetchImpl: statusFetch(400) })).ok, true);
  assert.strictEqual((await verifyResendKey({ apiKey: 'k', fetchImpl: statusFetch(403) })).ok, false);
  assert.strictEqual((await verifyResendKey({ apiKey: 'k', fetchImpl: statusFetch(401) })).ok, false);
  assert.strictEqual((await verifyResendKey({ apiKey: 'k', fetchImpl: statusFetch(500) })).ok, null);
  assert.strictEqual((await verifyResendKey({ apiKey: 'k', fetchImpl: async () => { throw new Error('offline'); } })).ok, null);
});

test('the key check sends nothing: an empty body, never a real email', async () => {
  const calls = [];
  await verifyResendKey({ apiKey: 'k', fetchImpl: async (u, o) => { calls.push(o); return { status: 422, json: async () => ({}) }; } });
  assert.strictEqual(calls[0].body, '{}');
});

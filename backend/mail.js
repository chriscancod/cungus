// Outbound email for order notifications and customer confirmations.
//
// Railway blocks outbound SMTP (ports 25/465/587) on Free, Trial and Hobby plans
// (docs.railway.com/networking/outbound-networking: "SMTP is only available on the
// Pro plan and above"). A Gmail App Password over SMTP therefore hangs until it times
// out: the first real order on 2026-09-26 held the customer on a spinner for two
// minutes because the payment route waited for a mail server it could never reach.
//
// So, in order of preference:
//   1. RESEND_API_KEY -> Resend's HTTPS API (port 443, works on every Railway plan).
//   2. EMAIL_USER + EMAIL_PASS -> SMTP via Gmail (works only on Railway Pro or elsewhere).
// Either way every send is capped at MAIL_TIMEOUT_MS, so an unreachable mail service
// can delay a request by seconds at most, never minutes.

const MAIL_TIMEOUT_MS = 8000;

function withTimeout(promise, ms, what) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Resend answers 200 {id} on success and 4xx {name, message} on failure. Until a sending
// domain is verified, Resend only delivers to the account owner's own address (fine for
// owner alerts; customer emails need the domain verified).
function resendMailer({ apiKey, from, replyTo, fetchImpl }) {
  return {
    kind: 'resend',
    async sendMail({ to, subject, text, html }) {
      const res = await withTimeout(
        fetchImpl('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from, to: Array.isArray(to) ? to : [to], subject, text, html,
            ...(replyTo ? { reply_to: replyTo } : {}),
          }),
        }),
        MAIL_TIMEOUT_MS, 'Resend request',
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Resend ${res.status}: ${body.message || body.name || 'request failed'}`);
      return body;
    },
  };
}

function smtpMailer({ user, pass, nodemailer }) {
  const transport = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    connectionTimeout: MAIL_TIMEOUT_MS, greetingTimeout: MAIL_TIMEOUT_MS, socketTimeout: MAIL_TIMEOUT_MS * 2,
  });
  return {
    kind: 'smtp',
    sendMail: opts => withTimeout(transport.sendMail({ ...opts, from: opts.from || user }), MAIL_TIMEOUT_MS + 2000, 'SMTP send'),
  };
}

// Returns { mailer, kind, note }. `mailer` is null when nothing is configured.
function createMailer(env, { fetchImpl, nodemailer } = {}) {
  if (env.RESEND_API_KEY) {
    const mailer = resendMailer({
      apiKey: env.RESEND_API_KEY,
      from: env.RESEND_FROM || '2AM <onboarding@resend.dev>',
      replyTo: env.OWNER_EMAIL || env.EMAIL_USER || undefined,
      fetchImpl,
    });
    const verified = Boolean(env.RESEND_FROM);
    return { mailer, kind: 'resend', note: verified ? 'Resend, custom sender' : 'Resend, shared sender (delivers to the account owner only until a domain is verified: set RESEND_FROM)' };
  }
  if (env.EMAIL_USER && env.EMAIL_PASS) {
    const onRailway = Boolean(env.RAILWAY_ENVIRONMENT);
    return {
      mailer: smtpMailer({ user: env.EMAIL_USER, pass: env.EMAIL_PASS, nodemailer }),
      kind: 'smtp',
      note: onRailway
        ? 'SMTP on Railway: outbound SMTP is blocked on Free/Trial/Hobby plans, so sends will time out. Set RESEND_API_KEY instead.'
        : 'SMTP (Gmail)',
    };
  }
  return { mailer: null, kind: 'none', note: 'not configured: order emails will NOT be sent (set RESEND_API_KEY)' };
}

module.exports = { createMailer, resendMailer, smtpMailer, withTimeout, MAIL_TIMEOUT_MS };

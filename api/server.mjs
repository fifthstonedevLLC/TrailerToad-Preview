// Quote-request endpoint for trailertoad.com.
// nginx proxies POST /api/quote here; we email the request to Trailer Toad through Amazon SES
// and send the customer a short confirmation.
//
// Environment (set in Dokploy, never in the repo):
//   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION   SES credentials (IAM user limited to ses:SendEmail)
//   QUOTE_TO      where requests go          (default trailertoad1@yahoo.com)
//   QUOTE_FROM    verified SES sender         (default quotes@trailertoad.com)
//   SES_DRY_RUN=1 log emails instead of sending them (local testing)
import http from 'node:http';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const PORT = +process.env.PORT || 3000;
const TO = process.env.QUOTE_TO || 'trailertoad1@yahoo.com';
const FROM = process.env.QUOTE_FROM || 'quotes@trailertoad.com';
const DRY_RUN = process.env.SES_DRY_RUN === '1';
const ses = DRY_RUN ? null : new SESv2Client({ region: process.env.AWS_REGION || 'us-east-2' });

// ---- small helpers
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
const clean = (v, max) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const oneLine = (v, max) => clean(v, max).replace(/\s+/g, ' ');
const send = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

// ---- rate limit: 5 requests per IP per 10 minutes (in memory; one container is plenty here)
const WINDOW = 10 * 60 * 1000, LIMIT = 5, hits = new Map();
const limited = ip => {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT;
};
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (list.every(t => now - t >= WINDOW)) hits.delete(ip);
}, WINDOW).unref();

// ---- validation: returns { data } or { error }
function validate(b) {
  const d = {
    name: oneLine(b.name, 100),
    email: oneLine(b.email, 200),
    phone: oneLine(b.phone, 40),
    tow: oneLine(b.tow, 60),
    weight: oneLine(b.weight, 40),
    zip: oneLine(b.zip, 20),
    addr: oneLine(b.addr, 40),
    message: clean(b.message, 4000),
  };
  if (!d.name) return { error: 'Please add your name.', field: 'name' };
  if (!d.email && !d.phone) return { error: 'Please add an email or phone number so we can reach you.', field: 'email' };
  if (d.email && !EMAIL_RE.test(d.email)) return { error: 'That email address doesn’t look right.', field: 'email' };
  if (!d.message) return { error: 'Please add a short note about what you tow.', field: 'message' };
  return { data: d };
}

const requestText = d => [
  `Name: ${d.name}`,
  `Email: ${d.email || '(not given)'}`,
  `Phone: ${d.phone || '(not given)'}`,
  `Tow vehicle: ${d.tow || '(not given)'}`,
  `Trailer weight: ${d.weight || '(not given)'}`,
  `Delivery ZIP/postal code: ${d.zip || '(not given)'}`,
  `Address type: ${d.addr || '(not given)'}`,
  '',
  d.message,
  '',
  '--',
  d.email ? 'Reply to this email to answer the customer directly.' : 'No email given. Call or text the customer.',
].join('\n');

const confirmText = d => [
  `Hi ${d.name.split(' ')[0]},`,
  '',
  'Thanks for reaching out to Trailer Toad. We got your request and will get back to you with answers and a freight quote.',
  '',
  'If you’d rather talk now, call or text (319) 404-7001.',
  '',
  'Here’s what you sent:',
  '',
  d.message,
  '',
  'Trailer Toad',
  'https://trailertoad.com',
].join('\n');

async function sendEmail({ to, replyTo, subject, text }) {
  if (DRY_RUN) {
    console.log(`[dry run] to=${to} replyTo=${replyTo || '-'} subject=${subject}\n${text}\n`);
    return;
  }
  await ses.send(new SendEmailCommand({
    FromEmailAddress: `Trailer Toad <${FROM}>`,
    Destination: { ToAddresses: [to] },
    ReplyToAddresses: replyTo ? [replyTo] : undefined,
    Content: { Simple: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Text: { Data: text, Charset: 'UTF-8' } },
    } },
  }));
}

// ---- server
const server = http.createServer((req, res) => {
  if (req.url === '/api/health') return send(res, 200, { ok: true });
  if (req.url !== '/api/quote') return send(res, 404, { error: 'Not found' });
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (!String(req.headers['content-type']).startsWith('application/json')) return send(res, 415, { error: 'Send JSON' });

  let raw = '';
  req.setEncoding('utf8');
  req.on('data', chunk => {
    raw += chunk;
    if (raw.length > 16_000) { send(res, 413, { error: 'Request too large' }); req.destroy(); }
  });
  req.on('end', async () => {
    if (res.headersSent) return;
    let body;
    try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'Bad request' }); }

    // bots: the hidden "company" field is filled, or the form was sent within 3 seconds of loading
    if (body.company || (Number(body.elapsed) || 0) < 3000) return send(res, 200, { ok: true });

    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
    if (limited(ip)) return send(res, 429, { error: 'Too many requests. Please call or text (319) 404-7001.' });

    const { data: d, error, field } = validate(body);
    if (error) return send(res, 400, { error, field });

    try {
      await sendEmail({
        to: TO,
        replyTo: d.email,
        subject: `Quote request from ${d.name}${d.tow ? ` (${d.tow})` : ''}`,
        text: requestText(d),
      });
    } catch (err) {
      console.error('SES send failed:', err.name, err.message);
      return send(res, 502, { error: 'We couldn’t send your request.' });
    }
    // the request is in; a failed confirmation shouldn't turn into an error for the customer
    if (d.email) {
      sendEmail({ to: d.email, subject: 'We got your Trailer Toad request', text: confirmText(d) })
        .catch(err => console.error('Confirmation email failed:', err.name, err.message));
    }
    console.log(`Quote request sent: ${d.name}`);
    send(res, 200, { ok: true });
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`trailertoad-api on 127.0.0.1:${PORT}${DRY_RUN ? ' (dry run)' : ''}`));

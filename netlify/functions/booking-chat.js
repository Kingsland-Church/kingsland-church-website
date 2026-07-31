/* Kingsland Church — Room Booking Assistant
   Netlify Function: /.netlify/functions/booking-chat
*/

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const RESEND_URL    = 'https://api.resend.com/emails';

const SYSTEM_PROMPT = `You are the friendly room booking assistant for Kingsland Community Centre, Colchester — a church-run community space at 86 London Road, Colchester, CO3 9DW.

Your role is to help people make a room hire enquiry by having a warm, natural conversation and gathering all the information the team needs. Be friendly, concise and welcoming.

## Rooms available
- Charter Hall — up to 200 people. Stage, PA system, AV projection, dressing rooms.
- Lemon Suite — up to 50 people. Projector, whiteboard, kitchen access.
- The Vestry — up to 20 people. Whiteboard, quiet meeting space.
- Café Area — up to 80 people. Café bar, informal seating, social layout.

## Opening hours
- Monday to Friday: 8:00am – 10:00pm
- Saturday: 9:00am – 4:00pm
- Sunday: not available for hire (church services)

## Key conditions to communicate naturally during the conversation
- The customer must arrange their own event insurance.
- The customer must have their own safeguarding policies in place.
- Any attendees under 18 must have an appropriate adult supervising them at all times on the premises.
- No smoking (including e-cigarettes) anywhere in the venue.
- No animals except registered assistance dogs.
- No third-party caterers or outside food/drink without prior written agreement.
- Cars cannot be left on site overnight.
- Cancellation policy: no charge if cancelled more than 48 hours before the event; full rate applies for cancellations within 48 hours.
- Final confirmed guest numbers and any dietary requirements are needed at least 14 business days before the event.
- Kingsland reserves the right to decline any booking.

## Internal church bookings
If the person is booking on behalf of Kingsland Church itself (a staff member, ministry team, or internal church group), their booking is automatically confirmed — no staff review needed. Let them know it's confirmed and proceed straight to the completion summary.

## Bookings to decline politely
Do not process requests for:
- Gambling, betting or gaming events
- Adult entertainment of any kind
- Events that promote or facilitate illegal activity
- Anything contrary to our Christian ethos or that could bring the church into disrepute
- Political party campaign events

For genuinely ambiguous cases, tell the user the team will review their request.

## Information to collect (gather naturally — combine questions where it feels right)
1. Full name (first and last name)
2. Organisation or group name (or confirm personal use)
3. Email address
4. Phone number
5. Which room(s) they need
6. Date of the event
7. Start time and end time — including setup and clear-up time
8. Expected number of attendees
9. Purpose / description of the event
10. Any extras needed (AV equipment, catering, accessibility requirements, etc.)

Once you have ALL ten pieces of information, present a clear summary and ask the user to confirm everything is correct.

When the user confirms the summary is correct, write your warm final confirmation message. Mention that the team will be in touch within 1 working day and that bookings are not confirmed until the customer receives written confirmation. Then on a new line write exactly:
[BOOKING_COMPLETE]
Then on the very next line, output a single JSON object with these exact keys (no extra text after the JSON):
{"name":"","org":"","email":"","phone":"","room":"","date":"","startTime":"","endTime":"","attendees":"","purpose":"","extras":""}

Do NOT include [BOOKING_COMPLETE] or JSON until the user has explicitly confirmed the summary.`;

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, body: 'Invalid JSON' }; }

  const { messages } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, body: '`messages` array required' };
  }

  /* ── Opening greeting (no Claude call needed) ──────────────────────── */
  if (messages.length === 1 && messages[0].content === '__GREET__') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: "Hi there! 👋 I'm Kingsland's booking assistant — I'm here to help you find and request the right space for your event.\n\nFirst things first: what's your full name?",
        complete: false,
      }),
    };
  }

  /* ── Call Claude ─────────────────────────────────────────────────────── */
  let aiText;
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system:     SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!res.ok) {
      console.error('Anthropic error', res.status, await res.text());
      return { statusCode: 502, body: 'AI service unavailable' };
    }

    const data = await res.json();
    aiText = data.content[0].text;
  } catch (err) {
    console.error('Fetch error:', err);
    return { statusCode: 502, body: 'AI service unavailable' };
  }

  /* ── Detect booking completion ───────────────────────────────────────── */
  const markerIdx = aiText.indexOf('[BOOKING_COMPLETE]');
  if (markerIdx !== -1) {
    const userMessage = aiText.slice(0, markerIdx).trim();
    const afterMarker = aiText.slice(markerIdx + '[BOOKING_COMPLETE]'.length).trim();

    let bookingData = null;
    try {
      const jsonMatch = afterMarker.match(/\{[\s\S]*\}/);
      if (jsonMatch) bookingData = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.warn('Could not parse booking JSON:', e.message);
    }

    if (bookingData) {
      checkChurchSuiteAvailability(bookingData).catch(console.warn);
      await sendStaffEmail(bookingData);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMessage, complete: true }),
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: aiText, complete: false }),
  };
};

/* ── ChurchSuite availability check (read-only, informational) ────────── */
async function checkChurchSuiteAvailability(data) {
  const apiKey  = process.env.CHURCHSUITE_API_KEY;
  const account = process.env.CHURCHSUITE_ACCOUNT;
  if (!apiKey || !account) return;

  const parsed = new Date(data.date);
  if (isNaN(parsed)) { console.warn('ChurchSuite: unparseable date', data.date); return; }

  const yyyy    = parsed.getFullYear();
  const mm      = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd      = String(parsed.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const url = `https://api.churchsuite.com/v2/bookings/bookings?starts_after=${dateStr}&starts_before=${dateStr}&status=confirmed`;

  const res = await fetch(url, {
    headers: {
      'X-Auth-Token': apiKey,
      'X-Account':    account,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    console.warn('ChurchSuite check failed:', res.status, await res.text());
    return;
  }

  const json = await res.json();
  console.log(`ChurchSuite: ${json.data?.length ?? 0} bookings on ${dateStr}`);
}

/* ── Staff notification email via Resend ─────────────────────────────── */
async function sendStaffEmail(data) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('RESEND_API_KEY not set — skipping email. Booking:', data);
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F7F7FB;font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.07);">
    <div style="background:linear-gradient(135deg,#2D26EF,#8747FE);padding:28px 32px;">
      <p style="margin:0;color:rgba(255,255,255,0.7);font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Kingsland Community Centre</p>
      <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:700;">New Room Booking Request</h1>
    </div>
    <div style="padding:28px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${row('Room', data.room)}
        ${row('Date', data.date)}
        ${row('Time', [data.startTime, data.endTime].filter(Boolean).join(' – '))}
        ${row('Attendees', data.attendees)}
        ${row('Purpose', data.purpose)}
        ${row('Extras', data.extras || 'None')}
      </table>
      <div style="margin:24px 0;border-top:1px solid #EBE9F1;"></div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        ${row('Contact name', data.name)}
        ${row('Organisation', data.org)}
        ${row('Email', data.email)}
        ${row('Phone', data.phone)}
      </table>
      <div style="margin-top:28px;padding:16px 20px;background:#EEF0FF;border-radius:10px;">
        <p style="margin:0;font-size:13px;color:#482D70;font-weight:600;">Next steps</p>
        <p style="margin:6px 0 0;font-size:13px;color:#6C6A78;line-height:1.6;">
          Review this request and reply within 1 working day.<br>
          Reply to <a href="mailto:${data.email}" style="color:#2D26EF;">${data.email}</a> to confirm or decline.
        </p>
      </div>
    </div>
    <div style="padding:16px 32px;background:#F7F7FB;border-top:1px solid #EBE9F1;">
      <p style="margin:0;font-size:12px;color:#6C6A78;">Submitted via the Kingsland website booking assistant · kingsland.org.uk</p>
    </div>
  </div>
</body>
</html>`;

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      from:     'Kingsland Bookings <bookings@kingsland.org.uk>',
      to:       ['bookings@kingsland.org.uk'],
      reply_to: data.email,
      subject:  `Room booking request: ${data.room} — ${data.date}`,
      html,
    }),
  });

  if (!res.ok) {
    console.error('Resend error:', res.status, await res.text());
  } else {
    console.log('Staff email sent for', data.name, data.date);
  }
}

function row(label, value) {
  return `<tr>
    <td style="padding:8px 0;font-size:13px;color:#6C6A78;font-weight:500;white-space:nowrap;vertical-align:top;width:130px;">${label}</td>
    <td style="padding:8px 0;font-size:14px;color:#16131F;font-weight:500;">${value || '—'}</td>
  </tr>`;
}

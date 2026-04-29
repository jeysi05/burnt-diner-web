import { NextResponse } from 'next/server';
import crypto from 'crypto';

const API_KEY = process.env.LALAMOVE_API_KEY!;
const API_SECRET = process.env.LALAMOVE_API_SECRET!;
const BASE_URL = 'https://rest.sandbox.lalamove.com';

function buildHeaders(method: string, path: string, body: string) {
  const timestamp = Date.now().toString();
  // ✅ Exact signature format Lalamove V3 requires
  const raw = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`;
  const signature = crypto.createHmac('sha256', API_SECRET).update(raw).digest('hex');

  return {
    'Content-Type': 'application/json',
    // ✅ Must be "hmac" not "LALAMOVE"
    'Authorization': `hmac ${API_KEY}:${timestamp}:${signature}`,
    'Market': 'PH',
    'Request-ID': crypto.randomUUID(),
  };
}

export async function POST(req: Request) {
  try {
    const { stops } = await req.json();

    if (!stops || stops.length < 2) {
      return NextResponse.json({ error: 'Need at least 2 stops (pickup + drop)' }, { status: 400 });
    }

    const path = '/v3/quotations';

    // ✅ Clean payload — only what Lalamove sandbox accepts, nothing extra
    const payload = {
      data: {
        serviceType: 'MOTORCYCLE',
        language: 'en_PH',
        stops: stops.map((s: { lat: number; lng: number; address: string }) => ({
          coordinates: {
            lat: String(s.lat),
            lng: String(s.lng),
          },
          address: s.address,
        })),
      },
    };

    const bodyText = JSON.stringify(payload);

    console.log('[Lalamove] Sending to sandbox:', bodyText);

    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: buildHeaders('POST', path, bodyText),
      body: bodyText,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Lalamove] Rejected:', JSON.stringify(data));
      return NextResponse.json({ error: data }, { status: response.status });
    }

    console.log('[Lalamove] Success:', JSON.stringify(data));
    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[Lalamove] Route error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
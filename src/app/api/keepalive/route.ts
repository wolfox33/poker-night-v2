import { NextRequest, NextResponse } from 'next/server';
import { getClient } from '@/lib/kv';

export async function GET(request: NextRequest) {
  try {
    const secret = process.env.KEEPALIVE_SECRET;

    if (!secret) {
      return NextResponse.json(
        { error: 'Keepalive secret is not configured' },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (token !== secret) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const now = new Date().toISOString();
    await getClient().set('keepalive:lastPing', now);

    return NextResponse.json(
      { ok: true, checkedAt: now },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Keepalive error:', error);
    return NextResponse.json(
      { error: 'Keepalive failed' },
      { status: 500 }
    );
  }
}

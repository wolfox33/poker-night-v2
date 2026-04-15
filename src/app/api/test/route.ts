import { NextResponse } from 'next/server';
import { getClient } from '@/lib/kv';

export async function GET() {
  const client = getClient();
  
  try {
    // Teste simples
    await client.set('test:key', 'hello world', 60);
    const result = await client.get('test:key');
    
    return NextResponse.json({ 
      success: true, 
      testGet: result 
    });
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: String(error) 
    }, { status: 500 });
  }
}
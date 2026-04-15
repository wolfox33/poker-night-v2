const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

console.log('UPSTASH_URL configured:', !!UPSTASH_URL);
console.log('UPSTASH_TOKEN configured:', !!UPSTASH_TOKEN);

export interface KVClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

function getClient(): KVClient {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    console.warn('Redis credentials not configured, using in-memory fallback');
    return createMemoryClient();
  }
  return createUpstashClient();
}

function createUpstashClient(): KVClient {
  const headers = {
    Authorization: `Bearer ${UPSTASH_TOKEN}`,
    'Content-Type': 'application/json',
  };

  return {
    async get(key: string): Promise<string | null> {
      try {
        const res = await fetch(`${UPSTASH_URL}/get/${encodeURIComponent(key)}`, { headers });
        const data = await res.json();
        return data.result || null;
      } catch (error) {
        console.error('Upstash GET error:', error);
        return null;
      }
    },

    async set(key: string, value: string, ttl?: number): Promise<void> {
      try {
        // Use POST to send value in body (better for JSON values)
        const body = ttl ? { value, ex: ttl } : { value };
        await fetch(`${UPSTASH_URL}/set/${encodeURIComponent(key)}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });
      } catch (error) {
        console.error('Upstash SET error:', error);
      }
    },

    async delete(key: string): Promise<void> {
      try {
        await fetch(`${UPSTASH_URL}/del/${encodeURIComponent(key)}`, {
          method: 'POST',
          headers,
        });
      } catch (error) {
        console.error('Upstash DEL error:', error);
      }
    },
  };
}

const memoryStore = new Map<string, { value: string; ttl?: number }>();

function createMemoryClient(): KVClient {
  return {
    async get(key: string): Promise<string | null> {
      const item = memoryStore.get(key);
      if (!item) return null;
      if (item.ttl && Date.now() > item.ttl) {
        memoryStore.delete(key);
        return null;
      }
      return item.value;
    },

    async set(key: string, value: string, ttl?: number): Promise<void> {
      memoryStore.set(key, {
        value,
        ttl: ttl ? Date.now() + ttl * 1000 : undefined,
      });
    },

    async delete(key: string): Promise<void> {
      memoryStore.delete(key);
    },
  };
}

export const kv = getClient();

export async function getTournament(id: string): Promise<string | null> {
  return kv.get(`tournament:${id}`);
}

export async function setTournament(id: string, data: string, ttl?: number): Promise<void> {
  return kv.set(`tournament:${id}`, data, ttl || 86400);
}

export async function getTournamentByCode(code: string): Promise<string | null> {
  return kv.get(`code:${code}`);
}

export async function setTournamentCode(code: string, id: string, ttl?: number): Promise<void> {
  return kv.set(`code:${code}`, id, ttl || 86400);
}
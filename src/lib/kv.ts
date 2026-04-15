const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

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
        const res = await fetch(`${UPSTASH_URL}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ command: 'GET', args: [key] }),
        });
        const data = await res.json();
        return data.result || null;
      } catch {
        return null;
      }
    },

    async set(key: string, value: string, ttl?: number): Promise<void> {
      const command = ttl 
        ? ['SET', key, value, 'EX', String(ttl)]
        : ['SET', key, value];
      
      await fetch(`${UPSTASH_URL}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ command: command[0], args: command.slice(1) }),
      });
    },

    async delete(key: string): Promise<void> {
      await fetch(`${UPSTASH_URL}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ command: 'DEL', args: [key] }),
      });
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
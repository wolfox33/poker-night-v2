import { Redis } from '@upstash/redis';

export interface KVClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  setIfNotExists(key: string, value: string, ttl: number): Promise<boolean>;
  delete(key: string): Promise<void>;
}

function createUpstashClient(url: string, token: string): KVClient {
  const redis = new Redis({
    url,
    token,
  });

  return {
    async get(key: string): Promise<string | null> {
      const result = await redis.get(key);
      if (result === null || result === undefined) return null;
      if (typeof result === 'string') return result;
      return JSON.stringify(result);
    },

    async set(key: string, value: string, ttl?: number): Promise<void> {
      if (ttl) {
        await redis.set(key, value, { ex: ttl });
      } else {
        await redis.set(key, value);
      }
    },

    async setIfNotExists(key: string, value: string, ttl: number): Promise<boolean> {
      const result = await redis.set(key, value, { ex: ttl, nx: true });
      return result === 'OK';
    },

    async delete(key: string): Promise<void> {
      await redis.del(key);
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
    async setIfNotExists(key: string, value: string, ttl: number): Promise<boolean> {
      const existing = await this.get(key);
      if (existing !== null) return false;
      memoryStore.set(key, {
        value,
        ttl: Date.now() + ttl * 1000,
      });
      return true;
    },
    async delete(key: string): Promise<void> {
      memoryStore.delete(key);
    },
  };
}

export function getClient(): KVClient {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Upstash Redis is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
    }
    return createMemoryClient();
  }
  return createUpstashClient(url, token);
}

export async function getTournament(id: string): Promise<string | null> {
  return getClient().get(`tournament:${id}`);
}

export async function setTournament(id: string, data: string, ttl?: number): Promise<void> {
  return getClient().set(`tournament:${id}`, data, ttl || 86400);
}

export async function getTournamentByCode(code: string): Promise<string | null> {
  return getClient().get(`code:${code}`);
}

export async function setTournamentCode(code: string, id: string, ttl?: number): Promise<void> {
  return getClient().set(`code:${code}`, id, ttl || 86400);
}

export async function acquireAdvanceLock(id: string, level: number, startedAt: number): Promise<boolean> {
  return getClient().setIfNotExists(`advance:${id}:${level}:${startedAt}`, '1', 30);
}

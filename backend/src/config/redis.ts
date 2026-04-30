import Redis from 'ioredis';
import { config } from './env';

const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => {
  console.error('Redis error', err);
});

export async function redisGet(key: string): Promise<string | null> {
  return redis.get(key);
}

export async function redisSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  await redis.set(key, value, 'EX', ttlSeconds);
}

export async function redisDel(key: string): Promise<void> {
  await redis.del(key);
}

export { redis };

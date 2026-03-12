import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    this.client = new Redis(config.get<string>('REDIS_URL', 'redis://localhost:6379'), {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis connection error', err);
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connected');
    });
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch (err) {
      this.logger.warn('Redis quit error during shutdown', err);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  async getOrSet<T>(key: string, ttlSeconds: number, fetchFn: () => Promise<T>): Promise<T> {
    const cached = await this.get(key);
    if (cached !== null) return JSON.parse(cached) as T;
    const value = await fetchFn();
    await this.set(key, JSON.stringify(value), ttlSeconds);
    return value;
  }

  async delByPattern(pattern: string): Promise<void> {
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }
}

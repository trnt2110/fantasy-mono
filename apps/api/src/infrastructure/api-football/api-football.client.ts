import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { RedisService } from '../redis/redis.service';

const CACHE_TTL_SECONDS = 60 * 60; // 60 minutes
const DAILY_LIMIT_HARD = 95;
const DAILY_LIMIT_WARN = 80;
const RATE_LIMIT_KEY_PREFIX = 'api_football:requests:';

@Injectable()
export class ApiFootballClient {
  private readonly logger = new Logger(ApiFootballClient.name);
  private readonly http: AxiosInstance;

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {
    this.http = axios.create({
      baseURL: config.get<string>('API_FOOTBALL_BASE_URL', 'https://v3.football.api-sports.io'),
      headers: {
        'x-apisports-key': config.get<string>('API_FOOTBALL_KEY', ''),
      },
      timeout: 15_000,
    });
  }

  async get<T>(path: string, params?: Record<string, any>): Promise<T> {
    const cacheKey = this.buildCacheKey(path, params);

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit: ${path}`);
      return JSON.parse(cached) as T;
    }

    await this.checkRateLimit();

    const response = await this.http.get<T>(path, { params });
    const data = response.data;

    await this.redis.set(cacheKey, JSON.stringify(data), CACHE_TTL_SECONDS);

    return data;
  }

  private async checkRateLimit(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const key = `${RATE_LIMIT_KEY_PREFIX}${today}`;

    // Compute TTL until midnight UTC
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    const ttl = Math.floor((midnight.getTime() - now.getTime()) / 1000);

    // Atomic INCR — counter is always correct regardless of concurrency
    const count = await this.redis.incr(key);

    // EXPIRE NX: only set TTL if the key has none yet (Redis 7+ NX option).
    // This is safe to call on every request — NX means it's a no-op if TTL is already set.
    // Prevents the "immortal key" bug: if the process dies after INCR but before EXPIRE,
    // the next request's EXPIRE NX will still set the TTL correctly.
    // EXPIRE NX: only set TTL if key has no expiry yet (prevents "immortal key" bug)
    await this.redis.client.call('EXPIRE', key, String(ttl), 'NX');

    if (count > DAILY_LIMIT_HARD) {
      this.logger.error(`API-Football daily quota exhausted: ${count} requests`);
      throw new ServiceUnavailableException('API-Football daily quota exhausted');
    }

    if (count > DAILY_LIMIT_WARN) {
      this.logger.warn(`API-Football quota warning: ${count}/${DAILY_LIMIT_HARD} requests used today`);
    }
  }

  private buildCacheKey(path: string, params?: Record<string, any>): string {
    // Omit any sensitive keys from the cache key to avoid logging secrets
    const safeParams = params
      ? Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'apiKey' && k !== 'key'))
      : undefined;
    const paramStr = safeParams ? `:${JSON.stringify(safeParams)}` : '';
    return `api_football:cache:${path}${paramStr}`;
  }

  async getDailyRequestCount(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const key = `${RATE_LIMIT_KEY_PREFIX}${today}`;
    const val = await this.redis.get(key);
    return val ? parseInt(val, 10) : 0;
  }
}

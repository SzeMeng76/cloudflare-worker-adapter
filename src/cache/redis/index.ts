import type { RedisOptions } from 'ioredis';
import { Redis } from 'ioredis';
import { cacheItemToType, calculateExpiration, decodeCacheItem, encodeCacheItem } from '../utils/cache';
import type { Cache, CacheItem, CacheStore, GetCacheInfo, PutCacheInfo } from '../types/types';

export class RedisCache implements Cache {
    private redis: Redis;

    constructor(redis: Redis) {
        this.redis = redis;
    }

    static create(options: RedisOptions): RedisCache {
        return new RedisCache(new Redis(options));
    }

    static createFromUri(uri: string): RedisCache {
        return new RedisCache(new Redis(uri));
    }

    async get(key: string, info?: GetCacheInfo): Promise<CacheItem | null> {
        const result = await this.redis.get(key);
        if (!result)
            return null;

        const item: CacheStore = JSON.parse(result);
        return decodeCacheItem(item.value, info?.type || item.info.type);
    }

    async put(key: string, value: CacheItem, info?: PutCacheInfo): Promise<void> {
        const cacheStore: CacheStore = {
            info: {
                type: cacheItemToType(value),
                expiration: calculateExpiration(info),
            },
            value: await encodeCacheItem(value),
        };
        if (info.expiration) {
            const ttl = Math.floor((info.expiration - Date.now()) / 1000);
            await this.redis.set(key, JSON.stringify(cacheStore), 'EX', ttl > 0 ? ttl : 0);
        } else {
            await this.redis.set(key, JSON.stringify(cacheStore));
        }
    }

    async list(prefix?: string, limit?: number): Promise<string[]> {
        return new Promise<string[]>((resolve, reject) => {
            this.redis.keys(`${prefix || ''}*`, (err, keys) => {
                if (err) {
                    reject(err);
                } else {
                    if (limit === null || limit === undefined) {
                        resolve(keys);
                    } else {
                        resolve(keys.slice(0, limit));
                    }
                }
            });
        });
    }

    async delete(key: string): Promise<void> {
        await this.redis.del(key);
    }

    async close() {
        await this.redis.quit();
    }
}

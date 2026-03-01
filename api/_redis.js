// Shared Upstash Redis client used by all serverless functions.
// Env vars set in Vercel dashboard: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
import { Redis } from '@upstash/redis';

export const redis = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

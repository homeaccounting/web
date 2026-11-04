import { randomUUID } from 'node:crypto';

// A fresh address per registration. Time-based addresses collide when parallel
// workers register in the same millisecond ("Email already registered").
export const uniqueEmail = (prefix = 'e2e') => `${prefix}-${randomUUID()}@example.com`;

import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { app } from '../../src/app.js';

const healthResponseSchema = z.object({
  status: z.literal('ok'),
  timestamp: z.string().datetime({ offset: true }),
  environment: z.literal('test'),
  service: z.literal('iam-api'),
});

describe('GET /api/v1/health', () => {
  it('returns the service health information', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('x-request-id', 'health-test-request')
      .expect('content-type', /json/)
      .expect('x-request-id', 'health-test-request')
      .expect(200);

    const unvalidatedResponseBody: unknown = JSON.parse(response.text);
    const responseBody = healthResponseSchema.parse(unvalidatedResponseBody);

    expect(responseBody.status).toBe('ok');
    expect(responseBody.environment).toBe('test');
    expect(responseBody.service).toBe('iam-api');
    expect(Number.isNaN(Date.parse(responseBody.timestamp))).toBe(false);
  });
});

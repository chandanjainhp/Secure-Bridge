/**
 * Newsletter API Tests
 * Tests for the newsletter subscription endpoint
 */

import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { app } from '../app.js';

describe('Newsletter API', () => {
  describe('POST /api/v1/newsletter/subscribe', () => {
    it('should accept a valid email subscription', async () => {
      const response = await request(app)
        .post('/api/v1/newsletter/subscribe')
        .send({ email: 'test@example.com' })
        .expect('Content-Type', /json/);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });

    it('should reject an invalid email format', async () => {
      const response = await request(app)
        .post('/api/v1/newsletter/subscribe')
        .send({ email: 'not-an-email' })
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('valid email');
    });

    it('should reject missing email', async () => {
      const response = await request(app)
        .post('/api/v1/newsletter/subscribe')
        .send({})
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should reject empty email', async () => {
      const response = await request(app)
        .post('/api/v1/newsletter/subscribe')
        .send({ email: '' })
        .expect('Content-Type', /json/);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('success', false);
    });

    it('should handle multiple valid email formats', async () => {
      const validEmails = [
        'user@example.com',
        'user.name@example.com',
        'user+tag@example.co.uk',
        'user123@test-domain.org',
      ];

      for (const email of validEmails) {
        const response = await request(app)
          .post('/api/v1/newsletter/subscribe')
          .send({ email });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }
    });
  });
});

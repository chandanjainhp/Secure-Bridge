import request from 'supertest';
import { app } from '../app.js';
import { User } from '../models/user.model.js';
import { ApiKey } from '../models/apikey.model.js';
import jwt from 'jsonwebtoken';
import { jest } from '@jest/globals';

jest.mock('axios', () => ({
  get: jest.fn(() => Promise.resolve({ status: 200, data: { data: [] } })),
}));

describe('API Key API', () => {
  let authToken;
  let userId;

  beforeAll(async () => {
    await User.deleteMany({});
    await ApiKey.deleteMany({});

    const user = await User.create({
      fullName: 'API Key Test',
      email: 'apikey-test@example.com',
      username: 'apikeytest',
      password: 'password123',
    });
    userId = user._id;

    authToken = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  });

  afterAll(async () => {
    await User.deleteMany({});
    await ApiKey.deleteMany({});
  });

  it('should save an API key', async () => {
    const res = await request(app)
      .post('/api/v1/api-key')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        provider: 'openai',
        key: 'sk-test-key-123',
      });

    if (res.status !== 200) {
      console.log('Save API key response:', JSON.stringify(res.body, null, 2));
    }

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('API key saved successfully');
  });

  it('should get masked API key', async () => {
    const res = await request(app)
      .get('/api/v1/api-key')
      .set('Authorization', `Bearer ${authToken}`);

    if (res.status !== 200) {
      console.log('Get API key response:', JSON.stringify(res.body, null, 2));
    }

    expect(res.status).toBe(200);
    expect(res.body.hasKey).toBe(true);
    expect(res.body.maskedKey).toBeDefined();
  });

  it('should delete API key', async () => {
    const res = await request(app)
      .delete('/api/v1/api-key')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('API key deleted successfully');
  });
});

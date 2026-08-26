import request from 'supertest';
import { app } from '../app.js';
import { User } from '../models/user.model.js';
import jwt from 'jsonwebtoken';

describe('Auth API', () => {
  let authToken;

  beforeAll(async () => {
    await User.deleteMany({});
  });

  afterAll(async () => {
    await User.deleteMany({});
  });

  it('should register a new user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
      });

    if (res.status !== 201) {
      console.log('Register response:', JSON.stringify(res.body, null, 2));
    }

    expect(res.status).toBe(201);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.email).toBe('test@example.com');
  });

  it('should login with existing user', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'test@example.com',
        password: 'password123',
      });

    if (res.status !== 200) {
      console.log('Login response:', JSON.stringify(res.body, null, 2));
    }

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.user).toBeDefined();
    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const accessTokenCookie = cookies.find(c => c.startsWith('accessToken='));
    expect(accessTokenCookie).toBeDefined();
    const match = accessTokenCookie.match(/accessToken=([^;]+)/);
    expect(match).toBeTruthy();
    authToken = match[1];
  });

  it('should reject invalid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'test@example.com',
        password: 'wrongpassword',
      });

    expect(res.status).toBe(401);
  });
});

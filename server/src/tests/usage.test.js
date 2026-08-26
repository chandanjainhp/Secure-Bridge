import request from 'supertest';
import { app } from '../app.js';
import { User } from '../models/user.model.js';
import UserUsage from '../features/usage/models/userUsage.model.js';
import jwt from 'jsonwebtoken';

describe('Usage API', () => {
  let authToken;

  beforeAll(async () => {
    await User.deleteMany({});
    await UserUsage.deleteMany({});

    const user = await User.create({
      fullName: 'Usage Test',
      email: 'usage-test@example.com',
      username: 'usagetest',
      password: 'password123',
    });

    authToken = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, { expiresIn: '1d' });
  });

  afterAll(async () => {
    await User.deleteMany({});
    await UserUsage.deleteMany({});
  });

  it('should get initial usage stats', async () => {
    const res = await request(app)
      .get('/api/v1/usage')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.used).toBe(0);
    expect(res.body.remaining).toBe(10);
    expect(res.body.limit).toBe(10);
  });
});

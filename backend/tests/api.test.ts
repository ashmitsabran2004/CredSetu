import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../src/app';
import { pool } from '../src/db';

jest.mock('../src/db', () => ({ pool: { query: jest.fn(), connect: jest.fn() } }));
const query = pool.query as jest.Mock;

beforeEach(() => { query.mockReset(); process.env.JWT_SECRET = 'test-secret'; });

describe('MiniLedger API', () => {
  it('stores a hashed OTP and prints the six-digit demo code', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    query.mockResolvedValue({ rows: [] });
    await request(app).post('/auth/request-otp').send({ phone: '+15555550111' }).expect(200);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO otps'),
      expect.arrayContaining(['+15555550111', expect.any(String)]),
    );
    const printed = String(log.mock.calls[0][0]);
    expect(printed).toMatch(/\d{6}$/);
    expect(query.mock.calls[0][1][1]).not.toBe(printed.slice(-6));
    log.mockRestore();
  });

  it('requests and verifies a one-time OTP, then refuses reuse', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    (pool.connect as jest.Mock).mockResolvedValue(client);
    query.mockResolvedValue({ rows: [] });
    client.query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('SELECT id, code_hash')) return { rowCount: 1, rows: [{ id: 4, code_hash: await bcrypt.hash('123456', 4) }] };
      if (sql.includes('INSERT INTO users')) return { rows: [{ id: 8 }] };
      return { rows: [] };
    });
    const first = await request(app).post('/auth/verify-otp').send({ phone: '+15555550111', code: '123456' });
    expect(first.status).toBe(200);
    expect(jwt.verify(first.body.token, 'test-secret')).toMatchObject({ userId: 8 });
    client.query.mockImplementation(async (sql: string) => sql.includes('SELECT id, code_hash') ? { rowCount: 0, rows: [] } : { rows: [] });
    const reuse = await request(app).post('/auth/verify-otp').send({ phone: '+15555550111', code: '123456' });
    expect(reuse.status).toBe(401);
    expect(client.query).toHaveBeenCalledWith('UPDATE otps SET used = TRUE WHERE id = $1', [4]);
  });

  it('rejects invalid loan values before running an insert', async () => {
    const token = jwt.sign({ userId: 1 }, 'test-secret');
    const response = await request(app).post('/loans').set('Authorization', `Bearer ${token}`)
      .send({ friend_name: ' ', amount: '0.001', due_date: '2025-02-30' });
    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Invalid request');
    expect(query).not.toHaveBeenCalled();
  });

  it('scopes the list query to the authenticated user', async () => {
    const token = jwt.sign({ userId: 27 }, 'test-secret');
    query.mockResolvedValue({ rows: [] });
    await request(app).get('/loans').set('Authorization', `Bearer ${token}`).expect(200);
    expect(query.mock.calls[0][1]).toEqual([27]);
    expect(query.mock.calls[0][0]).toContain('WHERE user_id = $1');
  });

  it('does not allow a second user to repay the first user\'s loan', async () => {
    const tokenForSecondUser = jwt.sign({ userId: 2 }, 'test-secret');
    query.mockResolvedValue({ rowCount: 0, rows: [] });
    const response = await request(app).patch('/loans/41/repay')
      .set('Authorization', `Bearer ${tokenForSecondUser}`).expect(404);
    expect(response.body.error.message).toBe('Loan not found');
    expect(query.mock.calls[0][0]).toContain('WHERE id = $1 AND user_id = $2');
    expect(query.mock.calls[0][1]).toEqual(['41', 2]);
  });

  it('uses one filtered-sum query for the authenticated user summary', async () => {
    const token = jwt.sign({ userId: 5 }, 'test-secret');
    query.mockResolvedValue({ rows: [{ total_lent: '195.75', total_repaid: '30.25', overdue_amount: '120.00' }] });
    const response = await request(app).get('/summary').set('Authorization', `Bearer ${token}`).expect(200);
    expect(response.body).toEqual({ total_lent: '195.75', total_repaid: '30.25', overdue_amount: '120.00' });
    expect(query.mock.calls[0][0]).toContain('SUM(amount) FILTER');
    expect(query.mock.calls[0][1]).toEqual([5]);
  });
});

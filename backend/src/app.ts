import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pool } from './db';
import { authMiddleware, AuthRequest } from './auth';
import { HttpError, errorHandler } from './errors';
import { loanSchema, requestOtpSchema, verifyOtpSchema } from './validation';

const app = express();
app.use(cors());
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true }));
const uploadDirectory = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });
app.use('/uploads', express.static(uploadDirectory));

const storage = multer.diskStorage({
  destination: (_req, _file, done) => done(null, uploadDirectory),
  filename: (_req, file, done) => done(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, done) => file.mimetype.startsWith('image/') ? done(null, true) : done(new HttpError(400, 'Receipt must be an image')),
});

app.post('/auth/request-otp', async (req, res, next) => {
  try {
    const { phone } = requestOtpSchema.parse(req.body);
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);
    await pool.query('INSERT INTO otps (phone, code_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'5 minutes\')', [phone, codeHash]);
    // Mock SMS delivery for local development: print the one-time code in the backend log.
    console.log(`MiniLedger OTP for ${phone}: ${code}`);
    res.json({ message: 'OTP sent (check the server console in this demo)' });
  } catch (error) { next(error); }
});

app.post('/auth/verify-otp', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { phone, code } = verifyOtpSchema.parse(req.body);
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT id, code_hash FROM otps WHERE phone = $1 AND used = FALSE AND expires_at > NOW() ORDER BY id DESC LIMIT 1 FOR UPDATE', [phone],
    );
    if (!result.rowCount || !(await bcrypt.compare(code, result.rows[0].code_hash))) throw new HttpError(401, 'Invalid or expired OTP');
    await client.query('UPDATE otps SET used = TRUE WHERE id = $1', [result.rows[0].id]);
    const user = await client.query(
      'INSERT INTO users (phone) VALUES ($1) ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone RETURNING id', [phone],
    );
    await client.query('COMMIT');
    const token = jwt.sign({ userId: user.rows[0].id }, process.env.JWT_SECRET!, { expiresIn: '7d' });
    res.json({ token });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    next(error);
  } finally { client.release(); }
});

app.use(authMiddleware);

app.post('/loans', upload.single('receipt'), async (req: AuthRequest, res, next) => {
  try {
    // Multipart forms send text values, while JSON clients may send a number.
    const input = loanSchema.parse(req.body);
    const receiptUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const result = await pool.query(
      'INSERT INTO loans (user_id, friend_name, amount, due_date, receipt_url) VALUES ($1, $2, $3, $4, $5) RETURNING id, friend_name, amount::text, due_date, repaid_at, receipt_url, created_at',
      [req.userId, input.friend_name, input.amount, input.due_date, receiptUrl],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

app.get('/loans', async (req: AuthRequest, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, friend_name, amount::text AS amount, due_date, repaid_at, receipt_url, created_at,
       (repaid_at IS NULL AND due_date < CURRENT_DATE) AS is_overdue
       FROM loans WHERE user_id = $1 ORDER BY created_at DESC, id DESC`, [req.userId],
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

app.patch('/loans/:id/repay', async (req: AuthRequest, res, next) => {
  try {
    const result = await pool.query(
      'UPDATE loans SET repaid_at = NOW() WHERE id = $1 AND user_id = $2 AND repaid_at IS NULL RETURNING id, friend_name, amount::text AS amount, due_date, repaid_at, receipt_url, created_at',
      [req.params.id, req.userId],
    );
    if (!result.rowCount) throw new HttpError(404, 'Loan not found');
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

app.get('/summary', async (req: AuthRequest, res, next) => {
  try {
    // NUMERIC stays text in node-postgres, avoiding JavaScript floating point rounding.
    const result = await pool.query(
      `SELECT COALESCE(SUM(amount), 0)::text AS total_lent,
       COALESCE(SUM(amount) FILTER (WHERE repaid_at IS NOT NULL), 0)::text AS total_repaid,
       COALESCE(SUM(amount) FILTER (WHERE repaid_at IS NULL AND due_date < CURRENT_DATE), 0)::text AS overdue_amount
       FROM loans WHERE user_id = $1`, [req.userId],
    );
    res.json(result.rows[0]);
  } catch (error) { next(error); }
});

app.use(errorHandler);
export default app;

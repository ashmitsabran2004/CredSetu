import 'dotenv/config';
import { pool } from './db';

async function seed(): Promise<void> {
  // The same demo phone is reused, so this script can be run more than once.
  const user = await pool.query(
    'INSERT INTO users (phone) VALUES ($1) ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone RETURNING id',
    ['+15555550123'],
  );
  await pool.query(
    `INSERT INTO loans (user_id, friend_name, amount, due_date, repaid_at)
     VALUES ($1, $2, $3, CURRENT_DATE + $4::integer, NULL),
            ($1, $5, $6, CURRENT_DATE + $7::integer, NULL),
            ($1, $8, $9, CURRENT_DATE + $10::integer, NOW())`,
    [user.rows[0].id, 'Sam', '45.50', 7, 'Alex', '120.00', -2, 'Jamie', '30.25', -1],
  );
  await pool.end();
}
seed().catch(async (error) => { console.error(error); await pool.end(); process.exitCode = 1; });

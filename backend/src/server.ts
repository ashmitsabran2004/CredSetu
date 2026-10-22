import 'dotenv/config';
import app from './app';

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
  throw new Error('DATABASE_URL and JWT_SECRET must be set');
}
const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0');

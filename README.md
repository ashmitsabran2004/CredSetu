# MiniLedger

MiniLedger is a small phone based ledger for tracking money lent to friends. It combines an Express and PostgreSQL API with an Expo React Native app.

## Features

- Phone number login using a six digit, expiring OTP
- Add loans with a friend, amount, due date, and optional receipt photo
- View loan status, summary totals, and repayment history
- Mark a loan repaid
- Keep each user's loan data private through authenticated, owner scoped queries

## Tech stack

- Backend: Node.js, TypeScript, Express, PostgreSQL, Zod, JWT, bcryptjs, Multer
- Mobile: React Native, Expo SDK 57, TypeScript, React Navigation, Expo SecureStore
- Tests: Jest and Supertest

## Prerequisites

- Node.js **22.13 or newer** (Expo SDK 57 minimum), npm, and Docker with Compose
- Expo Go compatible with SDK 57 on an Android phone, or an Android/iOS simulator that supports the project SDK
- A phone and development computer on the same Wi-Fi when testing on a physical device

Expo's SDK reference lists Node.js 22.13.x as the SDK 57 minimum: [Expo SDK reference](https://docs.expo.dev/versions/v57.0.0/).

## Run from a fresh clone

Run these steps from the project root unless a command changes directory.

1. Start PostgreSQL:

   ```sh
   docker compose up -d
   docker compose ps
   ```

   Compose creates the `miniledger` database and applies `db/init.sql` when the data volume is first created.

2. Configure the backend environment:

   ```sh
   cp .env.example backend/.env
   ```

   Edit `backend/.env` and replace `JWT_SECRET` with a long random value. For example, generate one with `openssl rand -hex 32`, then paste the result into that file. The example database URL matches the credentials and port in `docker-compose.yml`.

3. Install and start the backend:

   ```sh
   cd backend
   npm install
   npm run dev
   ```

   Keep this terminal running. The API listens on port `3000` by default. In another terminal, you can add demo data with `cd ~/Documents/CredSetu/backend && npm run seed`. The demo phone number is `+15555550123`; each seed run adds three more example loans to that account.

4. Request a demo OTP from another terminal and find it in the backend log:

   ```sh
   curl -X POST http://localhost:3000/auth/request-otp \
     -H 'Content-Type: application/json' \
     -d '{"phone":"+15555550123"}'
   ```

   OTP delivery is mocked: the six digit code is printed in the backend terminal. Use the newest code for that phone number; requesting another code makes the earlier code no longer the newest active one. When you request a code from the app in step 7, use that newly printed code instead.

5. Install the mobile dependencies:

   ```sh
   cd mobile
   npm install
   ```

6. Set the API URL when running on a physical phone, then start Expo. Find the laptop's Wi-Fi IP as described under [Troubleshooting phone connection](#troubleshooting-phone-connection), and use it in the URL:

   ```sh
   EXPO_PUBLIC_API_URL=http://<laptop-ip>:3000 npx expo start
   ```

   For an Android emulator, `http://10.0.2.2:3000` is commonly used to reach the host machine. For an iOS simulator, `http://localhost:3000` usually works. The source fallback is intentionally a placeholder; set `EXPO_PUBLIC_API_URL` before starting Expo. If Expo is already running, stop and restart it after changing the value.

7. Open Expo Go on the phone, scan the QR code, and request a login code. Read the newest OTP in the backend terminal, enter it in the app, then add and repay a demo entry.

## Tests and type checks

From the project root:

```sh
cd backend
npm install
npm test
npx tsc --noEmit
```

The API tests mock PostgreSQL, so they do not require Docker or a running database. Check the mobile TypeScript project separately:

```sh
cd mobile
npx tsc --noEmit
```

The test suite covers requesting and consuming an OTP, rejecting invalid loan input, user scoped loan access and cross user repayment, and summary response/query behavior.

## Troubleshooting phone connection

- Find the computer's LAN address with `ip -4 -o addr show scope global`. Use the IPv4 address on the Wi-Fi interface (often `wlan0` or `wlp…`), not `127.0.0.1`, `docker0`, or a Docker bridge address.
- Connect the phone and computer to the same Wi-Fi network. Set `EXPO_PUBLIC_API_URL=http://<laptop-ip>:3000` before starting or restarting Expo.
- On the phone, open `http://<laptop-ip>:3000/health` in a browser. A reachable API returns `{"ok":true}`.
- If UFW is enabled and blocks the backend, allow port 3000 with `sudo ufw allow 3000/tcp`.
- Some guest Wi-Fi networks block device to device traffic. Connect both devices to a phone hotspot, find the computer's hotspot interface address, and use that address for `EXPO_PUBLIC_API_URL`.
- Confirm `docker compose ps` shows PostgreSQL running and that the backend terminal is still running. An API timeout commonly means the phone cannot reach the laptop or the backend is not listening.

## API reference

Authenticated routes require `Authorization: Bearer <token>`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | No | API availability check; returns `{ "ok": true }` |
| `POST` | `/auth/request-otp` | No | Request an OTP with `{ "phone": "+14155552671" }` |
| `POST` | `/auth/verify-otp` | No | Verify `{ "phone": "+14155552671", "code": "123456" }`; returns a JWT |
| `POST` | `/loans` | Yes | Create a loan with `friend_name`, `amount`, `due_date`; accepts an optional image in multipart field `receipt` |
| `GET` | `/loans` | Yes | List the authenticated user's loans, including `is_overdue` |
| `PATCH` | `/loans/:id/repay` | Yes | Mark an owned, unrepaid loan repaid; returns 404 when it is not available to that user |
| `GET` | `/summary` | Yes | Return `total_lent`, `total_repaid`, and `overdue_amount` |

Errors have the shape `{ "error": { "message": "..." } }`; validation errors also include `details`. Receipt files are limited to images up to 5 MB and are served from `/uploads/...`.

## Design decisions

- The data model has `users`, `otps`, and `loans`. Loans reference an owner with a foreign key and store due dates as PostgreSQL `DATE` values.
- OTPs are random six digit codes. The database stores a bcrypt hash and an expiry timestamp; successful verification consumes the code once. The demo prints codes to the backend log instead of sending SMS.
- A successful login receives a seven day JWT. Middleware verifies it and attaches the user ID to the request.
- Loan reads, updates, and summaries scope SQL to the authenticated user. Repayment updates also include `user_id` in the `WHERE` clause.
- Money uses PostgreSQL `NUMERIC(12,2)`. The API validates and returns decimal strings so loan amounts do not pass through floating point calculations.
- The summary endpoint uses one SQL query with `SUM` and `FILTER` to calculate lent, repaid, and overdue totals. Overdue status compares the `DATE` due date with PostgreSQL `CURRENT_DATE`, without converting that date through a timezone.

## Possible improvements

- Replace mock OTP logging with a real SMS provider
- Add rate limiting to OTP requests and verification attempts
- Add refresh tokens and token revocation
- Paginate long loan lists
- Move receipt files to cloud object storage

## Screenshots

Add screenshots to [`docs/screenshots/`](docs/screenshots/) and link them here. That folder is kept as a placeholder in the repository.

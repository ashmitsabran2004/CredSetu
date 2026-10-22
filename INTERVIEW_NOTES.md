# MiniLedger interview notes

These notes explain the current implementation in plain language. The project is a demo: OTP delivery is printed to the backend terminal, and receipt images are saved on the backend machine.

## Backend files

### `backend/src/app.ts`

**What it does and why:** Creates the Express app, exposes `/health`, configures receipt uploads, implements the OTP and loan routes, and installs the auth and error middleware. SQL values are passed separately as query parameters. Each loan operation is scoped to the signed in user's ID. The summary query lets PostgreSQL calculate the totals in one round trip.

**Likely questions:**

- **How does the OTP flow work?** `POST /auth/request-otp` validates the international phone number, generates a random six digit code, hashes it with bcrypt, stores the hash with a five minute expiry, and prints the code for the demo. `POST /auth/verify-otp` locks the latest unused, unexpired record, compares the submitted code with bcrypt, marks it used, gets or creates the user, and signs a seven day JWT.
- **Why hash the OTP?** If the OTP table is exposed, the stored value is not directly usable as the login code. The server can still compare a submitted value with `bcrypt.compare`.
- **Can an OTP be reused?** A successful verification marks its row used. The lookup only chooses unused codes that have not expired.
- **How are loan owners isolated?** The verified request has a `userId`. List and summary queries filter on that ID. The repay `UPDATE` filters on both the loan ID and the owner ID, then returns 404 if nothing matched.
- **How does the summary work?** One `SELECT` calculates `SUM(amount)` for all loans, repaid loans, and overdue unpaid loans. `FILTER` selects the subset for each total; `COALESCE` returns zero for an empty set. SQL casts each total to text for the API.
- **How is overdue determined?** PostgreSQL compares the `DATE` column `due_date` with `CURRENT_DATE`, and excludes repaid loans. This does not convert the date through a JavaScript timestamp or timezone.
- **How are receipts checked?** Multer accepts a multipart field named `receipt`, limits files to 5 MB, and checks that the supplied MIME type begins with `image/`. It saves the file under `backend/uploads` using a random UUID filename. This is a demo-level MIME check; it does not inspect the image bytes.
- **Are values interpolated into SQL?** User data and seed values are passed in parameter arrays. Transaction commands such as `BEGIN` and `COMMIT` are fixed SQL statements with no values to bind.

### `backend/src/auth.ts`

**What it does and why:** Reads the `Authorization` header, requires the `Bearer ` scheme, verifies the JWT with `JWT_SECRET`, and attaches its `userId` to the request. Invalid, missing, or expired tokens become 401 errors. This middleware is installed before the protected loan routes.

**Likely questions:**

- **What stops someone from changing a token's user ID?** JWT signature verification detects payload changes unless the attacker knows the server secret.
- **Is the JWT encrypted?** No. It is signed, not encrypted; its claims can be read, so it contains only the user ID.
- **How long does a token last?** The login route signs it with a seven day expiry.

### `backend/src/validation.ts`

**What it does and why:** Defines Zod schemas for phone numbers, OTP codes, loan names, amounts, and due dates. It rejects malformed data before database inserts. Amounts stay strings and the positivity check inspects digits rather than converting money to a JavaScript float. A date is parsed and round-tripped in UTC to reject impossible calendar dates.

**Likely questions:**

- **Why use a string for amount input?** It preserves the decimal representation through validation and into PostgreSQL `NUMERIC`, avoiding floating point money arithmetic.
- **What amount format is allowed?** A positive decimal number with up to two digits after the decimal point, such as `12`, `12.5`, or `12.50`.
- **What date format is accepted?** A valid calendar date in `YYYY-MM-DD` format.

### `backend/src/db.ts`

**What it does and why:** Creates one `pg.Pool` using `DATABASE_URL`. The pool is shared by route handlers rather than opening a new database connection for every query.

**Likely question:** **Where does the database connection string come from?** `dotenv/config` loads `backend/.env` when starting from `backend/`, and `db.ts` reads `DATABASE_URL`.

### `backend/src/seed.ts`

**What it does and why:** Creates or reuses the demo user `+15555550123`, inserts three example loans with relative due dates, and closes the pool. The queries use parameter values, including amount strings, so examples retain decimal precision.

**Likely questions:**

- **Can I run it more than once?** Yes, the same user is reused, but each run appends another three loans; it does not clear existing entries.
- **Which examples are added?** One future unpaid loan, one overdue unpaid loan, and one repaid loan.

### `backend/src/server.ts`

**What it does and why:** Loads environment variables, checks that `DATABASE_URL` and `JWT_SECRET` exist, chooses `PORT` or `3000`, and listens on `0.0.0.0` so other devices on the LAN can connect.

**Likely question:** **Why bind to `0.0.0.0`?** Binding only to loopback would make the API inaccessible from a physical phone on the Wi-Fi network.

### `backend/src/errors.ts`

**What it does and why:** Defines `HttpError` for expected HTTP errors and maps validation, upload-size, and other errors to JSON responses. Unexpected errors are written to the backend error log and returned as a generic 500 message.

### `backend/tests/api.test.ts`

**What it does and why:** Uses Jest and Supertest to exercise the HTTP routes while mocking the PostgreSQL pool. The tests cover hashed and one-time OTP use, invalid loan input, owner scoping, a 404 when a different user tries to repay a loan, and the summary response and filtered aggregate query. Because the database is mocked, these tests do not run the SQL against a real PostgreSQL server.

**Likely questions:**

- **What does the ownership test prove?** It checks that the authenticated user's ID is included in loan queries and that cross-user repayment returns 404.
- **Does the summary test run PostgreSQL math?** No. It checks the aggregate SQL shape and confirms the route returns decimal-string totals from the mocked database result. The actual SQL execution requires a database integration check.
- **Why mock the pool?** The route tests run quickly without Docker or database setup and can focus on request validation and route behavior.

## Mobile files and screens

### `mobile/src/api.ts`

**What it does and why:** Wraps `fetch` for the API routes, applies a 15 second timeout, attaches the bearer token when present, and turns network and API errors into readable exceptions. It stores the JWT with Expo SecureStore, and creates `FormData` for loan creation and an optional receipt.

**Likely questions:**

- **Where is the login token stored?** In Expo SecureStore, under the key `miniledger-jwt`, with methods to read, save, and delete it.
- **How does the app send the receipt?** It adds the image URI as a multipart `receipt` file in `FormData`; the backend handles the actual file upload.
- **How are amounts represented?** As strings such as `"12.50"`, not JavaScript arithmetic values.

### `mobile/src/config.ts`

**What it does and why:** Reads `EXPO_PUBLIC_API_URL` at Expo startup. The fallback contains the explicit placeholder `YOUR-LAPTOP-IP`; for a phone, set the environment variable to the laptop's Wi-Fi IPv4 address and restart Expo. On Linux, `ip -4 -o addr show scope global` lists candidate addresses.

### `mobile/src/theme.ts`

**What it does and why:** Centralizes the app's palette, gradients, spacing, font sizes, and corner radii. The screens reuse these tokens so visual changes are easy to explain and consistent.

### `mobile/App.tsx` — Login screen

**What it does and why:** Checks SecureStore for an existing token, shows the login form when there is none, validates the phone and six digit code, requests or verifies OTPs through `apiClient`, then sets the token after a successful verification. The resend and back controls operate on the existing login state.

**Likely questions:**

- **Where does phone validation happen?** The screen gives immediate feedback, and the backend independently validates the phone and code with Zod.
- **What happens after login?** The token is saved in SecureStore and the root component switches to the authenticated navigation stack.

### `mobile/App.tsx` — Home screen

**What it does and why:** Reloads loans and summary when focused, supports pull to refresh, renders the totals and each loan, and calls the repay route before reloading. It shows status labels based on the API's overdue/repaid fields and the due date; the backend remains the source of overdue status.

**Likely questions:**

- **How does pull to refresh work?** `RefreshControl` calls the same `load(true)` function used after repayment.
- **How is a loan marked overdue in the UI?** The API returns `is_overdue`, computed with `due_date < CURRENT_DATE`; the UI displays the status and a due-soon label for upcoming dates.

### `mobile/App.tsx` — Add Entry screen

**What it does and why:** Collects a friend name, decimal amount, due date, and optional receipt. It validates the name and amount before using the existing `apiClient.addLoan` method, opens the native date picker, and requests media library access before selecting an image. On success it returns to Home.

**Likely questions:**

- **How does the date get to the server?** The selected date is serialized as `YYYY-MM-DD` from the Date object's ISO value.
- **Does the app take a new photo with the camera?** No. The current implementation opens the image library and can attach an existing image.
- **How does the app avoid repeating backend validation?** It has quick client-side checks for a useful experience, while the API still validates every request independently.

### `mobile/app.json`

**What it does and why:** Defines the Expo app name, slug, version, portrait orientation, and platform identifiers.

## 2 to 3 minute demo script

1. **0:00–0:20 — Introduce the project.** Show the repository and say MiniLedger is an Expo client backed by an Express/PostgreSQL API.
2. **0:20–0:45 — Show the running setup.** Show `docker compose ps`, the backend terminal, and the mobile app in Expo Go. Mention the API URL is configured with `EXPO_PUBLIC_API_URL` for a physical phone.
3. **0:45–1:05 — Log in.** Enter the demo phone `+15555550123`, request a code, point to the newly printed six digit OTP in the backend terminal, and complete verification.
4. **1:05–1:35 — Show the ledger.** Point out total lent, total repaid, overdue total, the seeded unpaid/repaid entries, and their status pills. Pull down once to demonstrate refresh.
5. **1:35–2:05 — Add a loan.** Add a friend's name, a decimal amount, choose a due date, optionally attach a receipt image, and save. Point out the new entry and updated totals.
6. **2:05–2:25 — Repay and show isolation.** Mark an unpaid demo entry repaid. Explain that the update includes both the loan ID and signed-in user ID, and that another user's loan appears as not found.
7. **2:25–2:45 — Close with design choices.** Mention hashed expiring OTPs, signed JWT auth, owner scoped SQL, PostgreSQL `NUMERIC`, and the aggregate summary query.

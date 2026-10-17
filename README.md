# Free Computer Education

A full-stack starter application for a free public computer-learning library. Anyone can read published courses and lessons without login or enrollment. Students must sign in to start tests and view personal results.

## Technology

- Node.js 20+, Express, MongoDB Atlas, Mongoose
- Server-side session authentication with HttpOnly cookies
- bcrypt password hashing, password-reset tokens stored as SHA-256 hashes
- Nodemailer SMTP password recovery
- Responsive HTML/CSS/JavaScript frontend
- Helmet security headers and rate limiting on authentication endpoints

## Implemented

- Public homepage, course search/filter, course pages and lesson navigation
- Registration, login, logout, profile update, forgot password and reset password
- Admin-only course/lesson/test creation and publication controls
- Online tests, timer, answer saving, server-side scoring and private student result history
- Admin overview and results list
- MongoDB-backed sessions in production configuration
- Environment-based configuration and Render deployment notes

## Requirements and local setup

1. Install Node.js 20 or newer and create a MongoDB Atlas cluster.
2. In Atlas, create a database user and allow your development IP address in Network Access.
3. Copy `.env.example` to `.env`, then set:
   - `MONGODB_URI` to your Atlas connection string
   - `SESSION_SECRET` to a random secret of at least 32 characters
   - `APP_URL=http://localhost:3000`
   - `COOKIE_SECURE=false` for local development
4. Install dependencies and start:

```bash
npm install
npm run dev
```

5. Create an admin account. Set `ADMIN_NAME`, `ADMIN_EMAIL`, and a unique `ADMIN_PASSWORD` (14+ characters) in `.env`, then run:

```bash
npm run create-admin
```

6. Open `http://localhost:3000`, log in with the admin account, and create courses, lessons and tests in `/admin`.

Do not commit `.env` to source control.

## SMTP / password recovery

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` to values from your email provider. Password-reset links expire after 15 minutes and are single-use. If SMTP is not configured, the API returns a clear error instead of claiming an email was sent.

## Deploy to GitHub and Render

1. Create a Git repository and push the source to GitHub.
2. In Render, create a **Web Service** from that repository.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables in Render:
   - `NODE_ENV=production`
   - `MONGODB_URI`
   - `SESSION_SECRET` (unique random value, at least 32 characters)
   - `APP_URL=https://YOUR-SERVICE.onrender.com`
   - `COOKIE_SECURE=true`
   - SMTP variables for password reset
   - `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` only for the one-time bootstrap command if needed
6. After first deploy, run `npm run create-admin` using Render Shell (if available), or run it locally with the production database URI. Prefer a one-time command and then remove bootstrap credentials from environment settings.
7. In MongoDB Atlas, restrict network access appropriately for your deployment and use a strong database password.

Render's local filesystem may be ephemeral. This starter does not implement media upload storage; use object storage such as S3 or Cloudinary before adding uploads.

## API overview

### Public
- `GET /api/courses`
- `GET /api/courses/:slug`
- `GET /api/lessons/:slug`
- `GET /api/search?q=...`
- `GET /api/tests/public`

### Authentication
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `PUT /api/student/profile`

### Student tests
- `POST /api/tests/:id/start`
- `PUT /api/attempts/:id/answers`
- `POST /api/attempts/:id/submit`
- `GET /api/student/results`

### Admin (session must belong to an admin)
- `GET /api/admin/overview`
- `GET|POST /api/admin/courses`
- `PUT|DELETE /api/admin/courses/:id`
- `GET|POST /api/admin/lessons`
- `PUT|DELETE /api/admin/lessons/:id`
- `GET|POST /api/admin/tests`
- `GET /api/admin/results`

## Important production notes

This is a usable MVP foundation, not a fully audited production examination platform. Before using it for high-stakes exams:

- Add CSRF protection for state-changing cookie-authenticated requests, stricter per-route rate limits, audit logs, monitoring and automated integration tests.
- Add attempt limits, scheduled test availability, question randomization, manual marking for descriptive answers, certificates, media storage, announcements, and site settings.
- Add HTML sanitization and a sandboxed preview if rich HTML lesson authoring is introduced. Current lesson content is rendered as escaped text so lesson content cannot execute HTML/JavaScript.
- Implement session revocation on password reset and consider regenerating the session ID on login to further harden session handling.
- Expand question types and result review rules. This MVP supports objective questions and server-side scoring; it does not yet provide a full descriptive-answer review workflow.
- Configure privacy policy, terms, contact details and domain-specific operational controls before public launch.
- Add automated end-to-end acceptance tests against a test MongoDB database.

## Security behavior

- Only published courses and lessons are available from public API endpoints.
- Test question correct answers are not sent to students before submission.
- Test scores are calculated on the server.
- Student results are scoped to the authenticated user's ID.
- Admin APIs validate the session role on the server.
- Password reset tokens are random, hashed in storage, expire in 15 minutes and cannot be reused.

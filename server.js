require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const { slugify } = require("./lib/utils");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/$/, "");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  mobile: { type: String, trim: true, maxlength: 25 },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["student", "admin"], default: "student" },
  createdAt: { type: Date, default: Date.now },
  passwordChangedAt: Date
});
const courseSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 180 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, default: "", maxlength: 3000 },
  category: { type: String, default: "Computer Basics", trim: true },
  level: { type: String, enum: ["Beginner", "Intermediate", "Advanced"], default: "Beginner" },
  coverImage: { type: String, default: "" },
  published: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const lessonSchema = new mongoose.Schema({
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  chapter: { type: String, default: "Getting Started" },
  content: { type: String, required: true, maxlength: 200000 },
  order: { type: Number, default: 0 },
  published: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const questionSchema = new mongoose.Schema({
  prompt: { type: String, required: true, maxlength: 3000 },
  options: [{ type: String, maxlength: 500 }],
  type: { type: String, enum: ["mcq", "true_false", "short"], default: "mcq" },
  correctAnswer: { type: String, required: true, maxlength: 1000 },
  explanation: { type: String, default: "", maxlength: 3000 },
  marks: { type: Number, default: 1, min: 0, max: 100 }
});
const testSchema = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 180 },
  description: { type: String, default: "", maxlength: 3000 },
  course: { type: mongoose.Schema.Types.ObjectId, ref: "Course" },
  durationMinutes: { type: Number, default: 15, min: 1, max: 240 },
  passingPercent: { type: Number, default: 40, min: 0, max: 100 },
  published: { type: Boolean, default: false },
  questions: [questionSchema],
  createdAt: { type: Date, default: Date.now }
});
const attemptSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  test: { type: mongoose.Schema.Types.ObjectId, ref: "Test", required: true },
  answers: { type: Map, of: String, default: {} },
  startedAt: { type: Date, default: Date.now },
  submittedAt: Date,
  score: Number,
  totalMarks: Number,
  percentage: Number,
  passed: Boolean
});
const resetSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, expires: 0 },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", userSchema);
const Course = mongoose.model("Course", courseSchema);
const Lesson = mongoose.model("Lesson", lessonSchema);
const Test = mongoose.model("Test", testSchema);
const Attempt = mongoose.model("Attempt", attemptSchema);
const PasswordReset = mongoose.model("PasswordReset", resetSchema);

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      frameSrc: ["https://www.youtube-nocookie.com", "https://www.youtube.com"],
      objectSrc: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

const sessionOptions = {
  name: "fce.sid",
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret-now",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
};
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}
if (process.env.MONGODB_URI) {
  sessionOptions.store = MongoStore.create({ mongoUrl: process.env.MONGODB_URI, collectionName: "sessions" });
}
app.use(session(sessionOptions));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false });
const resetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const safeUser = user => ({ id: user._id, name: user.name, email: user.email, mobile: user.mobile || "", role: user.role, createdAt: user.createdAt });
const requireAuth = (req, res, next) => req.session.userId ? next() : res.status(401).json({ error: "Please log in to continue.", loginRequired: true });
const requireAdmin = asyncRoute(async (req, res, next) => {
  if (!req.session.userId) return res.status(401).json({ error: "Login required." });
  const user = await User.findById(req.session.userId).select("role");
  if (!user || user.role !== "admin") return res.status(403).json({ error: "Administrator access required." });
  next();
});
const publicCourse = course => ({ id: course._id, title: course.title, slug: course.slug, description: course.description, category: course.category, level: course.level, coverImage: course.coverImage, order: course.order });
const publicLesson = lesson => ({ id: lesson._id, title: lesson.title, slug: lesson.slug, chapter: lesson.chapter, content: lesson.content, order: lesson.order, course: lesson.course });

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true, service: "Free Computer Education" }));

// Authentication
app.post("/api/auth/register", authLimiter, asyncRoute(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const mobile = String(req.body.mobile || "").trim();
  if (name.length < 2 || name.length > 100) return res.status(400).json({ error: "Name must be 2–100 characters." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 10 || password.length > 128) return res.status(400).json({ error: "Password must be 10–128 characters." });
  if (await User.exists({ email })) return res.status(409).json({ error: "An account with this email already exists." });
  const user = await User.create({ name, email, mobile, passwordHash: await bcrypt.hash(password, 12), role: "student" });
  req.session.userId = String(user._id);
  res.status(201).json({ user: safeUser(user) });
}));
app.post("/api/auth/login", authLimiter, asyncRoute(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "Invalid email or password." });
  req.session.userId = String(user._id);
  res.json({ user: safeUser(user), redirect: String(req.body.redirect || "/dashboard") });
}));
app.post("/api/auth/logout", (req, res, next) => req.session.destroy(err => {
  if (err) return next(err);
  res.clearCookie("fce.sid", { httpOnly: true, sameSite: "lax", secure: process.env.COOKIE_SECURE === "true" });
  res.json({ ok: true });
}));
app.get("/api/auth/me", asyncRoute(async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = await User.findById(req.session.userId);
  if (!user) { req.session.destroy(() => {}); return res.json({ user: null }); }
  res.json({ user: safeUser(user) });
}));
app.post("/api/auth/forgot-password", resetLimiter, asyncRoute(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const generic = "If an account exists for that email, password-reset instructions will be sent.";
  const user = await User.findOne({ email });
  if (user) {
    await PasswordReset.deleteMany({ user: user._id });
    const token = crypto.randomBytes(32).toString("hex");
    await PasswordReset.create({ user: user._id, tokenHash: crypto.createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 15 * 60 * 1000) });
    const configured = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;
    if (!configured) {
      console.error("Password reset requested but SMTP is not configured; no email was sent.");
      return res.status(503).json({ error: "Password reset email is not configured on this server. Please contact the site administrator." });
    }
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: user.email,
        subject: "Reset your Free Computer Education password",
        text: `Use this link within 15 minutes to reset your password: ${APP_URL}/reset-password?token=${token}\nIf you did not request this, ignore this email.`
      });
    } catch (err) {
      await PasswordReset.deleteMany({ user: user._id });
      console.error("Password reset email delivery failed:", err.message);
      return res.status(502).json({ error: "Email delivery failed. Please try again later." });
    }
  }
  res.json({ message: generic });
}));
app.post("/api/auth/reset-password", authLimiter, asyncRoute(async (req, res) => {
  const token = String(req.body.token || "");
  const password = String(req.body.password || "");
  if (password.length < 10 || password.length > 128) return res.status(400).json({ error: "Password must be 10–128 characters." });
  if (!/^[a-f0-9]{64}$/i.test(token)) return res.status(400).json({ error: "Invalid or expired reset link." });
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const reset = await PasswordReset.findOne({ tokenHash, expiresAt: { $gt: new Date() } });
  if (!reset) return res.status(400).json({ error: "Invalid or expired reset link." });
  const user = await User.findById(reset.user);
  if (!user) return res.status(400).json({ error: "Invalid or expired reset link." });
  user.passwordHash = await bcrypt.hash(password, 12);
  user.passwordChangedAt = new Date();
  await user.save();
  await PasswordReset.deleteMany({ user: user._id });
  res.json({ message: "Password reset successfully. Please log in with your new password." });
}));
app.put("/api/student/profile", requireAuth, asyncRoute(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const mobile = String(req.body.mobile || "").trim();
  if (name.length < 2 || name.length > 100) return res.status(400).json({ error: "Name must be 2–100 characters." });
  const user = await User.findByIdAndUpdate(req.session.userId, { name, mobile }, { new: true, runValidators: true });
  res.json({ user: safeUser(user) });
}));

// Public learning library: only published content is returned.
app.get("/api/courses", asyncRoute(async (req, res) => {
  const filter = { published: true };
  if (req.query.q) {
    const q = String(req.query.q).slice(0, 100);
    filter.$or = [{ title: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }, { description: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }, { category: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }];
  }
  const courses = await Course.find(filter).sort({ order: 1, title: 1 }).limit(100);
  res.json({ courses: courses.map(publicCourse) });
}));
app.get("/api/courses/:slug", asyncRoute(async (req, res) => {
  const course = await Course.findOne({ slug: req.params.slug, published: true });
  if (!course) return res.status(404).json({ error: "Course not found." });
  const lessons = await Lesson.find({ course: course._id, published: true }).sort({ order: 1, createdAt: 1 });
  res.json({ course: publicCourse(course), lessons: lessons.map(publicLesson) });
}));
app.get("/api/lessons/:slug", asyncRoute(async (req, res) => {
  const lesson = await Lesson.findOne({ slug: req.params.slug, published: true }).populate({ path: "course", match: { published: true } });
  if (!lesson || !lesson.course) return res.status(404).json({ error: "Lesson not found." });
  const siblings = await Lesson.find({ course: lesson.course._id, published: true }).sort({ order: 1, createdAt: 1 }).select("title slug order");
  const index = siblings.findIndex(item => String(item._id) === String(lesson._id));
  res.json({ lesson: { ...publicLesson(lesson), course: publicCourse(lesson.course) }, previous: index > 0 ? siblings[index - 1] : null, next: index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null });
}));
app.get("/api/search", asyncRoute(async (req, res) => {
  const q = String(req.query.q || "").trim().slice(0, 100);
  if (q.length < 2) return res.json({ courses: [], lessons: [] });
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const courses = await Course.find({ published: true, $or: [{ title: { $regex: escaped, $options: "i" } }, { description: { $regex: escaped, $options: "i" } }] }).limit(20);
  const lessons = await Lesson.find({ published: true, title: { $regex: escaped, $options: "i" } }).populate({ path: "course", match: { published: true }, select: "title slug" }).limit(30);
  res.json({ courses: courses.map(publicCourse), lessons: lessons.filter(x => x.course).map(x => ({ id: x._id, title: x.title, slug: x.slug, chapter: x.chapter, course: x.course })) });
}));
app.get("/api/tests/public", asyncRoute(async (_req, res) => {
  const tests = await Test.find({ published: true }).select("title description durationMinutes course").populate("course", "title slug").sort({ createdAt: -1 });
  res.json({ tests });
}));

// Student tests. Correct answers are never sent to the browser.
app.post("/api/tests/:id/start", requireAuth, asyncRoute(async (req, res) => {
  const test = await Test.findOne({ _id: req.params.id, published: true });
  if (!test) return res.status(404).json({ error: "Test not found or unavailable." });
  if (!test.questions.length) return res.status(400).json({ error: "This test has no questions yet." });
  const attempt = await Attempt.create({ user: req.session.userId, test: test._id });
  res.status(201).json({
    attemptId: attempt._id, startedAt: attempt.startedAt,
    test: { id: test._id, title: test.title, durationMinutes: test.durationMinutes,
      questions: test.questions.map((q, i) => ({ id: String(q._id), number: i + 1, prompt: q.prompt, options: q.options, type: q.type, marks: q.marks })) }
  });
}));
app.put("/api/attempts/:id/answers", requireAuth, asyncRoute(async (req, res) => {
  const attempt = await Attempt.findOne({ _id: req.params.id, user: req.session.userId, submittedAt: null });
  if (!attempt) return res.status(404).json({ error: "Active test attempt not found." });
  const test = await Test.findById(attempt.test);
  if (!test || Date.now() > attempt.startedAt.getTime() + test.durationMinutes * 60000) return res.status(400).json({ error: "Test time has expired. Submit the test to finalize it." });
  const submitted = req.body.answers || {};
  const allowed = new Set(test.questions.map(q => String(q._id)));
  for (const [id, answer] of Object.entries(submitted)) {
    if (allowed.has(id) && typeof answer === "string") attempt.answers.set(id, answer.slice(0, 2000));
  }
  await attempt.save();
  res.json({ saved: true });
}));
app.post("/api/attempts/:id/submit", requireAuth, asyncRoute(async (req, res) => {
  const attempt = await Attempt.findOne({ _id: req.params.id, user: req.session.userId });
  if (!attempt) return res.status(404).json({ error: "Test attempt not found." });
  if (attempt.submittedAt) return res.json({ result: resultFor(attempt) });
  const test = await Test.findById(attempt.test);
  if (!test) return res.status(404).json({ error: "Test not found." });
  if (Date.now() < attempt.startedAt.getTime() + test.durationMinutes * 60000) {
    // Early submissions are allowed; timer expiry is also accepted.
  }
  let score = 0, total = 0;
  for (const q of test.questions) {
    total += Number(q.marks || 0);
    const answer = String(attempt.answers.get(String(q._id)) || "").trim().toLowerCase();
    if (answer && answer === String(q.correctAnswer).trim().toLowerCase()) score += Number(q.marks || 0);
  }
  attempt.submittedAt = new Date();
  attempt.score = score;
  attempt.totalMarks = total;
  attempt.percentage = total ? Math.round(score / total * 10000) / 100 : 0;
  attempt.passed = attempt.percentage >= test.passingPercent;
  await attempt.save();
  res.json({ result: resultFor(attempt) });
}));
function resultFor(attempt) {
  return { id: attempt._id, test: attempt.test, score: attempt.score, totalMarks: attempt.totalMarks, percentage: attempt.percentage, passed: attempt.passed, submittedAt: attempt.submittedAt };
}
app.get("/api/student/results", requireAuth, asyncRoute(async (req, res) => {
  const attempts = await Attempt.find({ user: req.session.userId, submittedAt: { $ne: null } }).populate("test", "title").sort({ submittedAt: -1 }).limit(100);
  res.json({ results: attempts.map(a => ({ ...resultFor(a), test: a.test ? { id: a.test._id, title: a.test.title } : null })) });
}));

// Admin CRUD
app.get("/api/admin/overview", requireAdmin, asyncRoute(async (_req, res) => {
  const [students, courses, lessons, tests, attempts] = await Promise.all([
    User.countDocuments({ role: "student" }), Course.countDocuments(), Lesson.countDocuments(), Test.countDocuments(), Attempt.countDocuments()
  ]);
  res.json({ students, courses, lessons, tests, attempts });
}));
app.get("/api/admin/courses", requireAdmin, asyncRoute(async (_req, res) => {
  const courses = await Course.find().sort({ updatedAt: -1 });
  res.json({ courses: courses.map(c => ({ ...publicCourse(c), published: c.published, updatedAt: c.updatedAt })) });
}));
app.post("/api/admin/courses", requireAdmin, asyncRoute(async (req, res) => {
  const title = String(req.body.title || "").trim();
  if (title.length < 2) return res.status(400).json({ error: "Course title is required." });
  const slug = slugify(req.body.slug || title);
  if (!slug) return res.status(400).json({ error: "Please provide a valid slug." });
  const course = await Course.create({ title, slug, description: String(req.body.description || ""), category: String(req.body.category || "Computer Basics"), level: req.body.level || "Beginner", published: Boolean(req.body.published), coverImage: String(req.body.coverImage || ""), order: Number(req.body.order || 0) });
  res.status(201).json({ course: publicCourse(course), published: course.published });
}));
app.put("/api/admin/courses/:id", requireAdmin, asyncRoute(async (req, res) => {
  const updates = {};
  for (const key of ["title", "description", "category", "level", "coverImage"]) if (req.body[key] !== undefined) updates[key] = String(req.body[key]).trim();
  if (req.body.slug !== undefined) updates.slug = slugify(req.body.slug);
  if (req.body.published !== undefined) updates.published = Boolean(req.body.published);
  if (req.body.order !== undefined) updates.order = Number(req.body.order);
  updates.updatedAt = new Date();
  const course = await Course.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!course) return res.status(404).json({ error: "Course not found." });
  res.json({ course: { ...publicCourse(course), published: course.published } });
}));
app.delete("/api/admin/courses/:id", requireAdmin, asyncRoute(async (req, res) => {
  const course = await Course.findByIdAndDelete(req.params.id);
  if (!course) return res.status(404).json({ error: "Course not found." });
  await Lesson.deleteMany({ course: course._id });
  res.json({ ok: true });
}));
app.get("/api/admin/lessons", requireAdmin, asyncRoute(async (_req, res) => {
  const lessons = await Lesson.find().populate("course", "title slug").sort({ updatedAt: -1 });
  res.json({ lessons });
}));
app.post("/api/admin/lessons", requireAdmin, asyncRoute(async (req, res) => {
  const { course, title, content } = req.body;
  if (!mongoose.isValidObjectId(course) || String(title || "").trim().length < 2 || !String(content || "").trim()) return res.status(400).json({ error: "Course, lesson title and content are required." });
  const lesson = await Lesson.create({ course, title: String(title).trim(), slug: slugify(req.body.slug || title), chapter: String(req.body.chapter || "Getting Started"), content: String(content), published: Boolean(req.body.published), order: Number(req.body.order || 0) });
  res.status(201).json({ lesson });
}));
app.put("/api/admin/lessons/:id", requireAdmin, asyncRoute(async (req, res) => {
  const updates = {};
  for (const key of ["title", "slug", "chapter", "content"]) if (req.body[key] !== undefined) updates[key] = key === "slug" ? slugify(req.body[key]) : String(req.body[key]);
  if (req.body.course !== undefined) updates.course = req.body.course;
  if (req.body.published !== undefined) updates.published = Boolean(req.body.published);
  if (req.body.order !== undefined) updates.order = Number(req.body.order);
  updates.updatedAt = new Date();
  const lesson = await Lesson.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!lesson) return res.status(404).json({ error: "Lesson not found." });
  res.json({ lesson });
}));
app.delete("/api/admin/lessons/:id", requireAdmin, asyncRoute(async (req, res) => {
  const lesson = await Lesson.findByIdAndDelete(req.params.id);
  if (!lesson) return res.status(404).json({ error: "Lesson not found." });
  res.json({ ok: true });
}));
app.get("/api/admin/tests", requireAdmin, asyncRoute(async (_req, res) => {
  const tests = await Test.find().populate("course", "title").sort({ createdAt: -1 });
  res.json({ tests });
}));
app.post("/api/admin/tests", requireAdmin, asyncRoute(async (req, res) => {
  const title = String(req.body.title || "").trim();
  if (title.length < 2) return res.status(400).json({ error: "Test title is required." });
  const questions = Array.isArray(req.body.questions) ? req.body.questions.map(q => ({
    prompt: String(q.prompt || "").slice(0, 3000),
    options: Array.isArray(q.options) ? q.options.map(x => String(x).slice(0, 500)) : [],
    type: ["mcq", "true_false", "short"].includes(q.type) ? q.type : "mcq",
    correctAnswer: String(q.correctAnswer || "").slice(0, 1000),
    explanation: String(q.explanation || "").slice(0, 3000),
    marks: Math.max(0, Math.min(100, Number(q.marks || 1)))
  })) : [];
  if (questions.some(q => !q.prompt || !q.correctAnswer)) return res.status(400).json({ error: "Every question needs a prompt and correct answer." });
  const test = await Test.create({ title, description: String(req.body.description || ""), course: req.body.course || undefined, durationMinutes: Math.max(1, Math.min(240, Number(req.body.durationMinutes || 15))), passingPercent: Math.max(0, Math.min(100, Number(req.body.passingPercent ?? 40))), published: Boolean(req.body.published), questions });
  res.status(201).json({ test: { id: test._id, title: test.title } });
}));
app.get("/api/admin/results", requireAdmin, asyncRoute(async (_req, res) => {
  const attempts = await Attempt.find({ submittedAt: { $ne: null } }).populate("user", "name email").populate("test", "title").sort({ submittedAt: -1 }).limit(200);
  res.json({ results: attempts.map(a => ({ id: a._id, student: a.user ? { name: a.user.name, email: a.user.email } : null, test: a.test ? a.test.title : "Deleted test", score: a.score, totalMarks: a.totalMarks, percentage: a.percentage, passed: a.passed, submittedAt: a.submittedAt })) });
}));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err && err.code === 11000) return res.status(409).json({ error: "That title or email is already in use." });
  if (err && err.name === "ValidationError") return res.status(400).json({ error: "Some submitted fields are invalid." });
  if (err && err.name === "CastError") return res.status(400).json({ error: "Invalid identifier." });
  res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Something went wrong. Please try again." : (err.message || "Internal server error.") });
});

async function start() {
  if (!process.env.MONGODB_URI) {
    console.error("Missing MONGODB_URI. Copy .env.example to .env and configure MongoDB Atlas.");
    process.exit(1);
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    console.error("SESSION_SECRET must be configured with at least 32 characters.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  app.listen(PORT, () => console.log(`Free Computer Education running at ${APP_URL}`));
}
if (require.main === module) start().catch(err => { console.error("Startup failed:", err); process.exit(1); });
module.exports = { app, start, slugify };

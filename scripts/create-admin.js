require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["student", "admin"], default: "student" },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", userSchema);
(async () => {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
  const name = process.env.ADMIN_NAME || "Site Administrator";
  const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!email || password.length < 14 || password === "ChangeThisToALongUniquePassword!") {
    throw new Error("Set ADMIN_EMAIL and a unique ADMIN_PASSWORD (at least 14 characters) in .env before running this script.");
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const existing = await User.findOne({ email });
  if (existing) {
    existing.name = name;
    existing.passwordHash = await bcrypt.hash(password, 12);
    existing.role = "admin";
    await existing.save();
    console.log("Existing account updated to administrator.");
  } else {
    await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12), role: "admin" });
    console.log("Administrator account created.");
  }
  await mongoose.disconnect();
})().catch(err => { console.error(err.message); process.exit(1); });

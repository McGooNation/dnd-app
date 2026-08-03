// Simple local user store, backed by a JSON file on disk.
//
// This is intentionally lightweight — no database setup required to try
// accounts locally. It is NOT safe for production or concurrent heavy write
// load (no locking, whole-file rewrite on every write). When the app moves
// to a real database (see README "next steps"), this file is what gets
// replaced; everything that calls into it (server/index.js) shouldn't need
// to change much since the function shapes below can be mirrored by a DB-backed version.

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { v4: uuid } = require("uuid");

const DATA_DIR = path.join(__dirname, "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
}

function readAll() {
  ensureStore();
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
}

function writeAll(data) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

function findByEmail(email) {
  const data = readAll();
  return data.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || null;
}

function findById(id) {
  const data = readAll();
  return data.users.find((u) => u.id === id) || null;
}

async function createUser({ email, password, name }) {
  if (findByEmail(email)) {
    throw new Error("An account with that email already exists.");
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = { id: uuid(), email, passwordHash, name, createdAt: Date.now() };

  const data = readAll();
  data.users.push(user);
  writeAll(data);
  return user;
}

async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.passwordHash);
}

/** Strips the password hash before sending a user object to the client. */
function toPublic(user) {
  return { id: user.id, email: user.email, name: user.name };
}

module.exports = { findByEmail, findById, createUser, verifyPassword, toPublic };

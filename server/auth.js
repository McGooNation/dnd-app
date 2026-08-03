// Login token handling for accounts.
//
// JWT_SECRET must be provided via an environment variable — there is no
// built-in fallback. A missing/empty secret would mean anyone who reads
// this source file could forge valid login tokens for any account, so the
// server refuses to start at all rather than quietly running unsafely.
// The secret's value is never logged, never sent to the frontend, and
// never written anywhere in this file except this one comparison.

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.trim() === "") {
  throw new Error(
    "JWT_SECRET environment variable is not set. TavernTable's server will not start without it, " +
      "because it's what keeps login sessions secure — without a real secret, anyone could forge a " +
      "login token for any account. Set JWT_SECRET to a long random value before starting the server. " +
      "See README.md for local development instructions."
  );
}

function signToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: "30d" });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

module.exports = { signToken, verifyToken };

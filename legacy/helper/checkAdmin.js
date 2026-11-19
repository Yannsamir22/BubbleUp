const User = require("../model/user");

const admins = (process.env.ADMIN_USERNAMES || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

async function isAdmin(username) {
  if (!username) return false;
  const user = await User.findOne({ username: username.toLowerCase() });
  const usernameLower = username.toLowerCase();
  return !!(user && (user.isAdmin || admins.includes(usernameLower)));
}

module.exports = isAdmin;

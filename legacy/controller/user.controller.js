const User = require("../model/user");
const { passwordHash, comparePassword } = require("../helper/passwordHashing");
const isAdmin = require("../helper/checkAdmin");

async function registerUser(username, password, confirmation_password) {
  if (!username || !password || !confirmation_password)
    throw new Error(
      "Username, password and confirmation password are required.",
    );
  if (password !== confirmation_password)
    throw new Error("Passwords do not match.");
  try {
    const existUser = await User.findOne({ username: username.toLowerCase() });
    if (existUser) {
      throw new Error("User already exists!");
    }
    const hashedPassword = await passwordHash(password);
    const adminFlag = await isAdmin(username);
    const newUser = new User({
      username: username,
      password: hashedPassword,
      isAdmin: adminFlag,
    });
    await newUser.save();
    return newUser;
  } catch (error) {
    throw error;
  }
}

async function findUserByUsername(username) {
  if (!username) throw new Error("Username required.");
  try {
    const existUser = await User.findOne({ username: username.toLowerCase() });
    if (!existUser) {
      return null;
    }
    existUser.id = existUser._id.toString();
    return existUser;
  } catch (error) {
    throw error;
  }
}

module.exports = { registerUser, findUserByUsername };

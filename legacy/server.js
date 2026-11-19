// server.js
require("dotenv").config();
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
// Note: the app uses MongoDB via mongoose; the old SQLite helper is unused.
// If you need the SQLite helper, require it explicitly where needed.
const User = require("./controller/user.controller");
const Message = require("./controller/message.controller");
const { passwordHash, comparePassword } = require("./helper/passwordHashing");
const math = require("mathjs");
const axios = require("axios");
const mongoose = require("mongoose");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// --- Constants ---
const PORT = process.env.PORT || 8080;
const BOT_NAME = "Thinkmas";
const LEARN_PREFIX = "learn::"; // Standardized to lowercase
const WHISPER_PREFIX = "/w";
const HELP_PREFIX = "#help"; // Standardized to lowercase
const KICK_PREFIX = "/kick";
const BROADCAST_PREFIX = "/broadcast";
const ADMIN_DELETE_PREFIX = "/admindelete";
const BOT_TRIGGER_PREFIX = "#";
const APP_SERVICE_PORT = 8000; // Port for the app.js Q&A service - REMOVED
const APP_SERVICE_BASE_URL = `http://localhost:${APP_SERVICE_PORT}`; // REMOVED

// API Config (Pexels example - ensure URL, Header, Prefix match YOUR chosen API)
const IMAGE_API_KEY = process.env.IMAGE_API_KEY;
const IMAGE_API_URL = "https://api.pexels.com/v1/search";
const IMAGE_API_AUTH_HEADER = "Authorization";
const IMAGE_API_AUTH_PREFIX = "";

// Load Admin Usernames
const ADMINS = (process.env.ADMIN_USERNAMES || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
console.log("Admin users loaded:", ADMINS);

// --- Server State ---
let users = {}; // { socketId: { username: string, isAdmin: boolean, userId: number } }
let usernames = {}; // { username_lowercase: socketId }

// --- Bot Response Logic (app.js service REMOVED) ---
async function getAppServiceResponse(userInput) {
  try {
    const response = await axios.post(`${APP_SERVICE_BASE_URL}/chat`, {
      message: userInput,
    });
    console.log(response.data.response);
    return response.data.response;
  } catch (error) {
    console.error("Error querying app service:", error.message);
    if (error.code === "ECONNREFUSED") {
      return `Sorry, I couldn't reach my knowledge service. Is the Q&A app (port ${APP_SERVICE_PORT}) running?`;
    }
    return "Sorry, I had trouble reaching my knowledge base.";
  }
  return "I'm sorry, I can no longer answer general questions this way."; // Placeholder response
}

async function teachAppService(question, answer) {
  try {
    await axios.post(`${APP_SERVICE_BASE_URL}/reponse`, { question, answer });
    return true;
  } catch (error) {
    console.error(
      "Error teaching app service:",
      error.message,
      error.response?.data,
    );
    return false;
  }
  return false; // Learning via app.js is removed
}

// --- API Functions ---
async function searchImage(query) {
  if (
    !IMAGE_API_KEY ||
    !IMAGE_API_URL ||
    IMAGE_API_URL.includes("YOUR_CHOSEN")
  ) {
    console.warn("Image API not configured.");
    return null;
  }
  if (!query) return null;
  try {
    const response = await axios.get(IMAGE_API_URL, {
      params: { query: query, per_page: 1 },
      headers: {
        [IMAGE_API_AUTH_HEADER]: `${IMAGE_API_AUTH_PREFIX}${IMAGE_API_KEY}`,
      },
      timeout: 5000,
    });
    let imageUrl =
      response.data?.photos?.[0]?.src?.medium ||
      response.data?.photos?.[0]?.src?.large ||
      null;
    console.log(`Image search for "${query}" -> URL: ${imageUrl}`);
    return imageUrl;
  } catch (error) {
    console.error("Image API Error:", error.message);
    return null;
  }
}
async function getDefinition(word) {
  if (!word) return null;
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(
    word,
  )}`;
  try {
    const response = await axios.get(url, { timeout: 5000 });
    return (
      response.data?.[0]?.meanings?.[0]?.definitions?.[0]?.definition || null
    );
  } catch (error) {
    if (error.response?.status !== 404)
      console.error("Dictionary API Error:", error.message);
    return null;
  }
}

// --- Helpers ---
function broadcastUserList() {
  const userListForClient = Object.values(users).map((u) => u.username);
  io.emit("update user list", userListForClient);
}

// --- Server Setup ---
app.use(express.static(path.join(__dirname, "private"))); // Serve from 'private'

// --- Connexion à MongoDB ---
mongoose
  .connect(process.env.MONGO_URI || "mongodb://localhost:27017/thinkmas", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("MongoDB connected.");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// --- Socket.IO Handling ---
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // --- Registration ---
  socket.on("register", async ({ username, password }) => {
    username = username?.trim();
    password = password?.trim();

    // Username validation: 3-15 chars, alphanumeric, underscore, dot, hyphen
    const isValidUsername = /^[a-zA-Z0-9_.-]{3,15}$/.test(username);

    if (
      !username ||
      !isValidUsername ||
      !password ||
      password.length < 6 ||
      username.toLowerCase() === BOT_NAME.toLowerCase()
    ) {
      socket.emit(
        "register error",
        "Invalid username, , or password format/length.",
      );
      return;
    }
    try {
      const newUser = await User.registerUser(username, password, password);
      console.log(`User registered: ${newUser.username}`);
      socket.emit(
        "register success",
        `Registration successful. Please log in.`,
      );
    } catch (error) {
      console.error("Registration error:", error.message);
      socket.emit(
        "register error",
        error.message.includes("already taken")
          ? error.message
          : "Registration failed.",
      );
    }
  });

  // --- Login ---
  socket.on("login", async ({ username, password }) => {
    username = username?.trim();
    password = password?.trim();

    if (!username || !password) {
      socket.emit("login error", "Username, and password are required.");
      return;
    }
    if (users[socket.id]) {
      socket.emit("login error", "Already logged in.");
      return;
    }
    if (usernames[username.toLowerCase()]) {
      // Check if the already logged-in user is this socket trying to log in again
      // This specific check might be redundant if users[socket.id] is handled first.
      // However, if another socket has this username, it's a valid error.
      if (usernames[username.toLowerCase()] !== socket.id) {
        socket.emit(
          "login error",
          `User "${username}" is already logged in elsewhere.`,
        );
        return;
      }
    }

    try {
      let user = null;
      if (username) {
        user = await User.findUserByUsername(username);
      }

      if (!user) {
        socket.emit("login error", "User not found or invalid credentials.");
        return;
      }

      const passwordMatch = await comparePassword(
        password,
        user.password, // <-- c'est le hash stocké
      );
      if (!passwordMatch) {
        socket.emit("login error", "Invalid password or credentials.");
        return;
      }

      // Check if this user (by ID) is already logged in on another socket
      const existingSocketIdForUser = Object.keys(users).find(
        (sockId) => users[sockId].userId === user.id,
      );
      if (existingSocketIdForUser && existingSocketIdForUser !== socket.id) {
        socket.emit(
          "login error",
          `User "${user.username}" is already logged in on another session.`,
        );
        return;
      }

      // Success
      const isAdmin =
        user.isAdmin || ADMINS.includes(user.username.toLowerCase());

      console.log(
        `User ${user.username} logged in ${isAdmin ? "(Admin)" : ""}`,
      );
      users[socket.id] = {
        username: user.username,
        isAdmin: isAdmin,
        userId: user.id,
      };
      usernames[user.username.toLowerCase()] = socket.id; // Keep using username for this map
      socket.userId = user.id;
      socket.isAdmin = isAdmin;
      socket.emit("login success", user.username);
      socket.emit("info message", `Welcome back, ${user.username}!`);
      if (isAdmin)
        socket.emit(
          "info message",
          "Admin privileges active (/kick, /broadcast, /admindelete).",
        );
      socket.emit("info message", `Type #help for bot commands.`);
      try {
        const history = await Message.getRecentMessages(50);
        socket.emit("load history", history);
      } catch (histError) {
        console.error("Error fetching history:", histError);
      }
      socket.broadcast.emit("info message", `${user.username} has joined.`);
      broadcastUserList();
    } catch (error) {
      console.error("Login error:", error);
      socket.emit("login error", "Login failed due to a server error.");
    }
  });

  // --- Disconnect ---
  socket.on("disconnect", () => {
    const userData = users[socket.id];
    if (userData) {
      console.log(`User ${userData.username} disconnected`);
      delete usernames[userData.username.toLowerCase()];
      delete users[socket.id];
      io.emit("info message", `${userData.username} has left.`);
      broadcastUserList();
    } else {
      console.log(`Socket ${socket.id} disconnected before login.`);
    }
  });

  // --- Message Deletion Request ---
  socket.on("delete message", async ({ messageId }) => {
    const senderUserId = socket.userId;
    if (!senderUserId) {
      socket.emit("error message", "Auth error.");
      return;
    }
    if (!messageId) {
      socket.emit("error message", "Invalid request.");
      return;
    }
    if (!messageId) {
      socket.emit("error message", "Invalid request.");
      return;
    }
    console.log(
      `User ID ${senderUserId} requests deletion of message ID: ${messageId}`,
    );
    try {
      const result = await Message.markMessageAsDeleted(
        messageId,
        senderUserId,
      );
      io.emit("message deleted", { id: result.id });
      console.log(`Message ${result.id} marked deleted.`);
    } catch (error) {
      console.error(`Error deleting msg ${messageId}:`, error.message);
      socket.emit("error message", "Cannot delete this message.");
    }
  });

  // --- Main Message Handler ---
  socket.on("chat message", async (msg) => {
    const senderData = users[socket.id];
    const senderUsername = senderData?.username;
    const senderUserId = senderData?.userId;
    const isAdmin = senderData?.isAdmin || false;
    if (!senderUsername || !senderUserId) {
      socket.emit("error message", "Not logged in.");
      return;
    }
    msg = msg.trim();
    if (!msg) return;

    let messageType = "public";
    let recipientUsername = null;
    let storeThisMessage = true;
    let messageContentForDb = msg;
    let msgIdToEmit = null;
    let storedUserMsgId = null;
    let storedBotMsgId = null;

    try {
      // --- Check 1: Admin Commands ---
      if (isAdmin) {
        if (msg.toLowerCase().startsWith(KICK_PREFIX + " ")) {
          const parts = msg.substring(KICK_PREFIX.length).trim().split(" ");
          const targetUserLower = parts[0]?.toLowerCase();
          if (
            targetUserLower &&
            targetUserLower !== senderUsername.toLowerCase()
          ) {
            const targetSocketId = usernames[targetUserLower];
            if (targetSocketId) {
              const targetSocket = io.sockets.sockets.get(targetSocketId);
              if (targetSocket) {
                targetSocket.emit(
                  "info message",
                  `Kicked by admin ${senderUsername}.`,
                );
                targetSocket.disconnect(true);
                io.emit(
                  "info message",
                  `${targetUserLower} was kicked by ${senderUsername}.`,
                );
                console.log(
                  `Admin ${senderUsername} kicked ${targetUserLower}`,
                );
              } else {
                socket.emit(
                  "error message",
                  `Socket error kicking ${targetUserLower}.`,
                );
              }
            } else {
              socket.emit(
                "error message",
                `User "${targetUserLower}" not found.`,
              );
            }
          } else if (targetUserLower === senderUsername.toLowerCase()) {
            socket.emit("error message", `You cannot kick yourself.`);
          } else {
            socket.emit("error message", `Usage: /kick <username>`);
          }
          return;
        } else if (msg.toLowerCase().startsWith(BROADCAST_PREFIX + " ")) {
          const broadcastContent = msg
            .substring(BROADCAST_PREFIX.length)
            .trim();
          if (broadcastContent) {
            console.log(
              `Admin ${senderUsername} broadcasting: ${broadcastContent}`,
            );
            await Message.storeMessage({
              userId: senderUserId,
              senderUsername: `Admin ${senderUsername}`,
              messageType: "broadcast",
              content: broadcastContent,
            });
            io.emit("broadcast message", senderUsername, broadcastContent);
          } else {
            socket.emit("error message", `Usage: /broadcast <message>`);
          }
          return;
        } else if (msg.toLowerCase().startsWith(ADMIN_DELETE_PREFIX + " ")) {
          const parts = msg
            .substring(ADMIN_DELETE_PREFIX.length)
            .trim()
            .split(" ");
          const targetMessageId = parts[0]; // Expect string ID
          if (targetMessageId) {
            try {
              const result =
                await Message.markMessageAsDeletedByAdmin(targetMessageId);
              io.emit("message deleted", { id: result.id });
              socket.emit(
                "info message",
                `Admin deleted message ${result.id}.`,
              );
              console.log(
                `Admin ${senderUsername} deleted message ${result.id}.`,
              );
            } catch (delErr) {
              console.error(
                `Admin delete error for msg ${targetMessageId}:`,
                delErr.message,
              );
              socket.emit(
                "error message",
                `Failed to admin-delete: ${delErr.message}`,
              );
            }
          } else {
            socket.emit("error message", `Usage: /admindelete <message_id>`);
          }
          return;
        }
      } // End Admin Command Checks

      // --- Check 2: Learn ---
      if (msg.toLowerCase().startsWith(LEARN_PREFIX + " ")) {
        // Ensure space after learn::
        storeThisMessage = false;
        const learnData = msg.substring(LEARN_PREFIX.length).split("::");
        if (learnData.length === 2) {
          const phrase = learnData[0].trim(); // app.js will handle casing
          const responseText = learnData[1].trim();
          if (phrase && responseText) {
            const success = await teachAppService(phrase, responseText);
            if (success) {
              socket.emit(
                "info message",
                `I received the learn command for: "${phrase}" -> "${responseText}", but my learning module is currently disabled.`,
              );
            } else {
              socket.emit(
                "error message",
                "I am currently unable to learn new responses.",
              );
            }
          } else {
            socket.emit(
              "error message",
              `Invalid learn format. Use: learn:: question :: answer`,
            );
          }
        } else {
          socket.emit(
            "error message",
            `Invalid learn format. Use: learn:: question :: answer`,
          );
        }
        return;
      }
      // --- Check 3: Whisper ---
      if (msg.startsWith(WHISPER_PREFIX + " ")) {
        messageType = "whisper";
        const parts = msg.substring(WHISPER_PREFIX.length).trim().split(" ");
        const targetUserLower = parts.shift()?.toLowerCase(); // Get first part as user, rest is message
        const privateMessage = parts.join(" ");
        if (!targetUserLower || !privateMessage) {
          socket.emit("error message", `Usage: /w <user> <message>`);
          storeThisMessage = false;
          return;
        }
        if (targetUserLower === senderUsername.toLowerCase()) {
          socket.emit("error message", "Can't whisper yourself!");
          storeThisMessage = false;
          return;
        }
        const targetSocketId = usernames[targetUserLower];
        if (targetSocketId) {
          io.to(targetSocketId).emit(
            "private message",
            senderUsername,
            privateMessage,
          );
          socket.emit(
            "private message confirmation",
            targetUserLower,
            privateMessage,
          );
          recipientUsername = targetUserLower;
          messageContentForDb = privateMessage;
        } else {
          socket.emit("error message", `User "${targetUserLower}" not found.`);
          storeThisMessage = false;
        }
        if (storeThisMessage && recipientUsername) {
          await Message.storeMessage({
            userId: senderUserId,
            senderUsername,
            recipientUsername,
            messageType,
            content: messageContentForDb,
          });
        }
        return;
      }
      // --- Check 4: Specific Bot Commands (e.g., #calc, #image, #define, #help) ---
      if (msg.startsWith("#")) {
        // General check for commands starting with #
        messageType = "";
        messageContentForDb = msg;
        storeThisMessage = true;
        if (msg.length > 1) {
          try {
            const storedResult = await Message.storeMessage({
              userId: senderUserId,
              senderUsername,
              messageType: "bot_response",
              content: messageContentForDb,
            });
            storedUserMsgId = storedResult.id;
          } catch (dbErr) {
            console.error("DB store error:", dbErr);
            storeThisMessage = false;
          }
        } else {
          storeThisMessage = false;
        }
        if (storeThisMessage)
          socket.broadcast.emit("chat message", {
            sender: senderUsername,
            msg: msg,
            id: storedUserMsgId,
          });

        // --- Sub-Check: #calc ---
        if (
          msg.toLowerCase().startsWith("#calc ") &&
          msg.length > "#calc ".length
        ) {
          const expression = msg.substring("#calc ".length).trim();
          let calcResultText = "";
          if (expression) {
            try {
              calcResultText = `${expression} = ${math.format(
                math.evaluate(expression),
                { precision: 14 },
              )}`;
            } catch (error) {
              calcResultText = `Calculation error: ${error.message}`;
            }
          } else {
            calcResultText = "Usage: #calc <expression>";
          }
          try {
            const storedResult = await Message.storeMessage({
              userId: null,
              senderUsername: BOT_NAME,
              messageType: "bot_response",
              content: calcResultText,
            });
            storedBotMsgId = storedResult.id;
          } catch (dbErr) {
            console.error("DB calc response store error:", dbErr);
          }
          setTimeout(() => {
            io.emit("chat message", {
              sender: BOT_NAME,
              msg: calcResultText,
              id: storedBotMsgId,
            });
          }, 100);
          return;
        }
        // --- Sub-Check: #image ---
        else if (
          msg.toLowerCase().startsWith("#image ") &&
          msg.length > "#image ".length
        ) {
          const searchTerm = msg.substring("#image ".length).trim();
          let responseContent = "";
          if (searchTerm) {
            const imageUrl = await searchImage(searchTerm);
            if (imageUrl) {
              responseContent = `Image for "${searchTerm}": ${imageUrl}`;
            } else {
              responseContent = `Sorry, no image found for "${searchTerm}".`;
            }
          } else {
            responseContent = "Usage: #image <search term>";
          }
          try {
            const storedResult = await Message.storeMessage({
              userId: null,
              senderUsername: BOT_NAME,
              messageType: "bot_response",
              content: responseContent,
            });
            storedBotMsgId = storedResult.id;
          } catch (dbErr) {
            console.error("DB image response store error:", dbErr);
          }
          setTimeout(() => {
            io.emit("chat message", {
              sender: BOT_NAME,
              msg: responseContent,
              id: storedBotMsgId,
            });
          }, 200);
          return;
        }
        // --- Sub-Check: #define ---
        else if (
          msg.toLowerCase().startsWith("#define ") &&
          msg.length > "#define ".length
        ) {
          const wordToDefine = msg.substring("#define ".length).trim();
          let responseContent = "";
          if (wordToDefine) {
            const definition = await getDefinition(wordToDefine);
            if (definition) {
              responseContent = `Definition of "${wordToDefine}": ${definition}`;
            } else {
              responseContent = `Sorry, no definition found for "${wordToDefine}".`;
            }
          } else {
            responseContent = "Usage: #define <word>";
          }
          try {
            const storedResult = await Message.storeMessage({
              userId: null,
              senderUsername: BOT_NAME,
              messageType: "bot_response",
              content: responseContent,
            });
            storedBotMsgId = storedResult.id;
          } catch (dbErr) {
            console.error("DB define response store error:", dbErr);
          }
          setTimeout(() => {
            io.emit("chat message", {
              sender: BOT_NAME,
              msg: responseContent,
              id: storedBotMsgId,
            });
          }, 200);
          return;
        }
        // --- Sub-Check: #help ---
        else if (msg.toLowerCase() === HELP_PREFIX) {
          // HELP_PREFIX is #help
          storeThisMessage = false; // Help command itself is not stored as a user message
          let helpText = `Available commands:\n`;
          helpText += `- Type anything to chat publicly.\n`;
          helpText += `- ${WHISPER_PREFIX} <username> <message> - Send a private message.\n`;
          helpText += `- ${LEARN_PREFIX} question :: answer - Teach the bot.\n`;
          helpText += `- #calc <expression> - Calculate a math expression.\n`;
          helpText += `- #image <term> - Search for an image.\n`;
          helpText += `- #define <word> - Get a word definition.\n`;
          helpText += `- ${BOT_TRIGGER_PREFIX} <your query> - Ask the bot a question.\n`;
          helpText += `- #help - Show this help message.\n`;
          if (isAdmin) {
            helpText += `\nAdmin commands:\n`;
            helpText += `- ${KICK_PREFIX}<username> - Kick a user.\n`;
            helpText += `- ${BROADCAST_PREFIX}<message> - Send a message to all users.\n`;
            helpText += `- ${ADMIN_DELETE_PREFIX}<message_id> - Delete any message.\n`;
          }
          socket.emit("info message", helpText);
          // No need to store or broadcast the #help command itself as a chat message
          return;
        }
        // --- Sub-Check: General Bot Query (e.g., #thinkmas what is the weather?) ---
        // This will now catch any message starting with BOT_TRIGGER_PREFIX (#) followed by a space,
        // that wasn't a more specific command like #calc, #image, #define, #help.
        // The client.js now sends "# your query" from the Thinkmas private chat.
        else if (
          msg.toLowerCase().startsWith(BOT_TRIGGER_PREFIX + " ") &&
          msg.length > BOT_TRIGGER_PREFIX.length + 1
        ) {
          // Now, we process the query part for the bot.

          const botQuery = msg.substring(BOT_TRIGGER_PREFIX.length).trim();
          let responseContent = "";
          if (botQuery) {
            const botResponseText = await getAppServiceResponse(botQuery);
            responseContent = botResponseText;
          } else {
            responseContent = "Use #help or type # followed by your query.";
            // This case (empty query after #thinkmas) might not be hit if msg.length check above is strict
          }
          try {
            const storedResult = await Message.storeMessage({
              userId: null,
              senderUsername: BOT_NAME,
              messageType: "bot_response",
              content: responseContent,
            });
            storedBotMsgId = storedResult.id;
          } catch (dbErr) {
            console.error("DB bot response store error:", dbErr);
          }
          setTimeout(() => {
            io.emit("chat message", {
              sender: BOT_NAME,
              msg: responseContent,
              id: storedBotMsgId,
            });
          }, 150);
          return;
        }
        // If it started with # but wasn't any of the above, it's an unknown #command
        // The original message (e.g. "#unknown") would have been stored and broadcast if storeThisMessage was true.
        // We can optionally send an "unknown command" message back to the user.
        // For now, it will just be treated as a public message that was already handled.
      } // End of specific Bot Commands (starting with #)

      // --- Public Message ---
      else {
        console.log(`Public message from ${senderUsername}: ${msg}`);
        messageType = "public";
        messageContentForDb = msg;
        msgIdToEmit = null;
        const storedResult = await Message.storeMessage({
          userId: senderUserId,
          senderUsername,
          messageType,
          content: messageContentForDb,
        });
        msgIdToEmit = storedResult.id;
        socket.broadcast.emit("chat message", {
          sender: senderUsername,
          msg: messageContentForDb,
          id: msgIdToEmit,
        });
      }
    } catch (error) {
      console.error(`Error processing message: ${msg}`, error);
      socket.emit("error message", "An error occurred.");
    }
  }); // End 'chat message' handler
}); // --- END io.on('connection') ---

// --- Graceful Shutdown ---
process.on("SIGINT", async () => {
  console.log("SIGINT: Closing DB & exiting.");
  await mongoose.disconnect();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  console.log("SIGTERM: Closing DB & exiting.");
  await mongoose.disconnect();
  process.exit(0);
});

// --- Start Server ---
server.listen(PORT, () => {
  console.log(`${BOT_NAME} server listening on port ${PORT}`);
  console.log(`Access chat at http://localhost:${PORT}`);
});

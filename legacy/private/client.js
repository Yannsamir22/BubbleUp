// client.js
const socket = io();

// --- Constants ---
const LEARN_PREFIX = "learn::";
const KICK_PREFIX = "/kick";
const WHISPER_PREFIX = "/w";
const BROADCAST_PREFIX = "/broadcast";
const ADMIN_DELETE_PREFIX = "/admindelete";
const BOT_TRIGGER_PREFIX = "#";
const BOT_NAME = "Thinkmas"; // Bot name defined on client

// --- DOM Elements ---
const authArea = document.getElementById("auth-area");
const loginView = document.getElementById("login-view");
const loginForm = document.getElementById("login-form");
const loginUsernameInput = document.getElementById("login-username");
const loginPasswordInput = document.getElementById("login-password");
const loginError = document.getElementById("login-error");
const loginSuccess = document.getElementById("login-success");
const showRegisterLink = document.getElementById("show-register");
const registerView = document.getElementById("register-view");
const registerForm = document.getElementById("register-form");
const registerUsernameInput = document.getElementById("register-username");
const registerPasswordInput = document.getElementById("register-password");
const registerError = document.getElementById("register-error");
const showLoginLink = document.getElementById("show-login");
const chatArea = document.getElementById("chat-area");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");
const messages = document.getElementById("messages");
const userList = document.getElementById("user-list");
const chatTitle = document.querySelector("#message-area h1");

// --- State ---
let myUsername = null;
let isLoggedIn = false;

// --- Helper Functions ---
function formatTimestamp(isoTimestamp) {
  if (!isoTimestamp) return "";
  try {
    const date = new Date(isoTimestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    console.error("Timestamp format error", e);
    return "";
  }
}

function addMessage(data, type = "info") {
  const item = document.createElement("li");
  let contentHtml = "";
  let messageTypeClass = type;
  let senderPrefix = "";
  let messageId = null;
  let isOwnMessage = false;
  let messageIsDeleted = false;
  let sender = "";
  let messageText = "";
  let timestamp = null;

  if (typeof data === "string") {
    contentHtml = data.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  } else if (typeof data === "object" && data !== null) {
    sender = data.sender || data.sender_username;
    messageText = data.msg !== undefined ? data.msg : data.content;
    messageId = data.id;
    timestamp = data.timestamp;
    messageIsDeleted = data.is_deleted === 1;
    if (!sender || messageText === undefined) {
      console.warn("Invalid message object:", data);
      return;
    }
    isOwnMessage = sender === myUsername;

    if (messageIsDeleted) {
      const timeString = formatTimestamp(timestamp);
      contentHtml = `<span class="deleted-text">[message deleted]</span>`;
      if (timeString)
        contentHtml += ` <span class="timestamp">(${timeString})</span>`;
      messageTypeClass = "info deleted-message-item";
    } else {
      if (sender.toLowerCase() === BOT_NAME.toLowerCase()) {
        senderPrefix = `${BOT_NAME}: `;
        messageTypeClass = "message-bot";
      } else if (isOwnMessage) {
        senderPrefix = "You: ";
        messageTypeClass = "message-own";
      } else {
        senderPrefix = `${sender}: `;
        messageTypeClass = "message-other";
      }
      if (data.message_type === "bot_response")
        messageTypeClass = "message-bot";
      else if (data.message_type === "whisper")
        messageTypeClass = "message-private";
      else if (data.message_type === "broadcast")
        messageTypeClass = "message-broadcast"; // Handle broadcast class
      if (
        sender === myUsername &&
        sender.toLowerCase() !== BOT_NAME.toLowerCase()
      )
        messageTypeClass = "message-own";

      const timeString = formatTimestamp(timestamp);
      let imageFoundAndRendered = false;

      if (sender.toLowerCase() === BOT_NAME.toLowerCase()) {
        const imageUrlRegex =
          /(https?:\/\/[^\s()<>"]+\.(?:jpg|jpeg|png|gif|webp|bmp))/gi;
        const match = imageUrlRegex.exec(messageText);
        if (match) {
          const imageUrl = match[0];
          const textBefore = messageText
            .substring(0, match.index)
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          const textAfter = messageText
            .substring(match.index + match[0].length)
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          contentHtml = `${senderPrefix}${textBefore} <a href="${imageUrl}" target="_blank" rel="noopener noreferrer" title="Ouvrir l'image"><img src="${imageUrl}" alt="Image" class="chat-image"></a> ${textAfter}`;
          imageFoundAndRendered = true;
        }
      }
      if (!imageFoundAndRendered) {
        contentHtml = `${senderPrefix}${messageText
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")}`;
      }
      if (timeString) {
        contentHtml += ` <span class="timestamp">(${timeString})</span>`;
      }
      if (isOwnMessage && messageId && !messageIsDeleted) {
        contentHtml += `&nbsp;<button class="delete-button" data-message-id="${messageId}" title="Delete Message">🗑️</button>`;
      }
    }
  } else {
    console.warn("Invalid data to addMessage:", data);
    return;
  }

  item.innerHTML = contentHtml;
  item.classList.add(messageTypeClass);
  if (messageId) {
    item.dataset.messageId = messageId;
  }
  const isScrolledToBottom =
    messages.scrollHeight - messages.clientHeight <= messages.scrollTop + 5;
  messages.appendChild(item);
  if (isScrolledToBottom) messages.scrollTop = messages.scrollHeight;
}
function updateUserList(users) {
  userList.innerHTML = "";
  users.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  users.forEach((user) => {
    const item = document.createElement("li");
    const sanitizedUser = user.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    item.textContent = sanitizedUser;
    if (user === myUsername) {
      item.style.fontWeight = "bold";
    }
    userList.appendChild(item);
  });
}
function showLoginView(errorMessage = "", successMessage = "") {
  chatArea.style.display = "none";
  authArea.style.display = "block";
  registerView.style.display = "none";
  loginView.style.display = "block";
  loginError.textContent = errorMessage;
  loginSuccess.textContent = successMessage;
  registerError.textContent = "";
  isLoggedIn = false;
  myUsername = null;
  loginUsernameInput.focus();
  if (chatTitle) chatTitle.textContent = "Chat Room";
}
function showRegisterView(errorMessage = "") {
  chatArea.style.display = "none";
  authArea.style.display = "block";
  loginView.style.display = "none";
  registerView.style.display = "block";
  registerError.textContent = errorMessage;
  loginSuccess.textContent = "";
  loginError.textContent = "";
  isLoggedIn = false;
  myUsername = null;
  registerUsernameInput.focus();
}
function showChatView() {
  authArea.style.display = "none";
  chatArea.style.display = "flex";
  if (chatTitle && myUsername)
    chatTitle.textContent = `${BOT_NAME} Chat (Logged in as ${myUsername})`;
  messages.innerHTML = "";
  messageInput.focus();
  loginForm.reset();
  registerForm.reset();
  loginError.textContent = "";
  loginSuccess.textContent = "";
  registerError.textContent = "";
}

// --- Event Listeners ---
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const username = loginUsernameInput.value.trim();
  const password = loginPasswordInput.value.trim();
  if (username && password) {
    socket.emit("login", { username, password });
    loginError.textContent = "";
  } else {
    loginError.textContent = "Username and password required.";
  }
});
registerForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const username = registerUsernameInput.value.trim();
  const password = registerPasswordInput.value.trim();
  const confirm = document
    .getElementById("register-password-confirm")
    .value.trim();
  if (
    !username ||
    username.length < 3 ||
    username.length > 15 ||
    !/^[a-zA-Z0-9_]+$/.test(username) ||
    !password ||
    password.length < 6 ||
    username.toLowerCase() === BOT_NAME.toLowerCase() ||
    password !== confirm
  ) {
    registerError.textContent = "Invalid username or password.";
    return;
  }
  socket.emit("register", { username, password, confirmation: confirm });
  registerError.textContent = "";
});
showRegisterLink.addEventListener("click", (e) => {
  e.preventDefault();
  showRegisterView();
});
showLoginLink.addEventListener("click", (e) => {
  e.preventDefault();
  showLoginView();
});
messageForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!isLoggedIn) return;
  const message = messageInput.value.trim();
  if (message) {
    socket.emit("chat message", message);
    if (
      !message.toLowerCase().startsWith(LEARN_PREFIX) &&
      !message.startsWith(WHISPER_PREFIX) &&
      !message.startsWith(BOT_TRIGGER_PREFIX) &&
      !message.startsWith(KICK_PREFIX) &&
      !message.startsWith(BROADCAST_PREFIX) &&
      !message.startsWith(ADMIN_DELETE_PREFIX)
    ) {
      addMessage({ sender: myUsername, msg: message });
    } else if (message.startsWith(BOT_TRIGGER_PREFIX)) {
      addMessage({ sender: myUsername, msg: `(to ${BOT_NAME}): ${message}` });
    }
    messageInput.value = "";
  }
});
messages.addEventListener("click", (e) => {
  if (e.target?.classList.contains("delete-button")) {
    const button = e.target;
    const messageId = button.dataset.messageId;
    if (messageId && confirm("Delete this message?")) {
      socket.emit("delete message", { messageId: messageId });
      button.disabled = true;
      button.textContent = "...";
    }
  }
});

// --- Socket Handlers ---
socket.on("connect", () => {
  console.log("Connected.");
  showLoginView();
});
socket.on("login success", (username) => {
  isLoggedIn = true;
  myUsername = username;
  showChatView();
  console.log(`Logged in as ${username}`);
});
socket.on("login error", (message) => {
  showLoginView(message);
});
socket.on("register success", (message) => {
  showLoginView("", message);
});
socket.on("register error", (message) => {
  showRegisterView(message);
});
socket.on("info message", (msg) => {
  addMessage(msg, "info");
});
socket.on("error message", (msg) => {
  addMessage(msg, "error");
});
socket.on("chat message", (data) => {
  if (data.sender === myUsername) return;
  addMessage(data);
}); // Expects {sender, msg, id}
socket.on("private message", (sender, msg) => {
  addMessage({ sender: sender, msg: `Whisper: ${msg}` }, "message-private");
});
socket.on("private message confirmation", (recipient, msg) => {
  addMessage(
    { sender: "You", msg: `Whisper to ${recipient}: ${msg}` },
    "message-private-sent",
  );
});
socket.on("update user list", (users) => {
  updateUserList(users);
});
socket.on("load history", (history) => {
  console.log("Loading history:", history.length);
  messages.innerHTML = "";
  history.forEach((msgData) => addMessage(msgData));
  messages.scrollTop = messages.scrollHeight;
});
socket.on("message deleted", ({ id }) => {
  console.log(`Received delete for message ${id}`);
  const messageItem = messages.querySelector(`li[data-message-id="${id}"]`);
  if (messageItem) {
    const timestampSpan = messageItem.querySelector("span.timestamp");
    const timestampHtml = timestampSpan ? timestampSpan.outerHTML : "";
    messageItem.innerHTML = `<span class="deleted-text">[message deleted]</span> ${timestampHtml}`;
    messageItem.className = "info deleted-message-item";
  } else {
    console.warn(`Could not find message ${id} to delete.`);
  }
});
socket.on("disconnect", (reason) => {
  console.log(`Disconnected: ${reason}`);
  isLoggedIn = false;
  myUsername = null;
  showLoginView(`Disconnected: ${reason}.`);
  userList.innerHTML = "<li>N/A</li>";
});
socket.on("connect_error", (err) => {
  console.error("Connection Error:", err.message);
  if (!authArea.style.display || authArea.style.display === "none") {
    showLoginView(`Connection Error.`);
  }
});
socket.on("broadcast message", (adminUsername, msg) => {
  addMessage({
    sender: `ADMIN ${adminUsername}`,
    content: msg,
    message_type: "broadcast",
  });
}); // Handle broadcast

// --- Initial State ---
showLoginView();

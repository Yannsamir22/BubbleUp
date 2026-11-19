// Static lists used by pickers. (Kept separate so they're easy to edit.)

export const QUICK_REACTIONS = ["👍", "😂", "❤️", "🎉", "🤯", "👀"];

export const EMOJI_GROUPS = {
  Smileys: "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 🤓 😎 🥳 🤔 🤨 😐 😑 😶 🙄 😏 😬 😮‍💨 😌 😴 🤤 😷 🤒 🤯 🥵 🥶 😵 🤠 🫡 😕 😟 🙁 😮 😲 😳 🥺 😢 😭 😱 😤 😡 🤬 💀 🤡 👻 👽 🤖 💩".split(" "),
  Gestures: "👍 👎 👏 🙌 🫶 👐 🤝 🙏 ✌️ 🤞 🤟 🤘 👌 🤌 👈 👉 👆 👇 ☝️ ✋ 🖐️ 👋 🤙 💪 🧠 👀 👁️ 🫠".split(" "),
  School: "📚 📖 📝 ✏️ 🖊️ 📐 📏 🧮 🔬 🧪 🔭 🌍 🗺️ 💻 🖥️ 🎒 🏫 🎓 🍎 📅 ⏰ 📌 📎 💡 🧩 🏆 🥇 📊 📈 ✅ ❌ ❓ ❗".split(" "),
  Other: "🎉 🎊 🎈 🎂 🍕 🍔 🍟 🍩 🍪 ☕ 🧃 ⚽ 🏀 🎮 🎲 🎵 🎸 🎨 🚀 🌈 ⭐ 🌟 ✨ 🔥 💯 ❤️ 🧡 💛 💚 💙 💜 🖤 💔 🦄 🐱 🐶 🦊 🐸 🐼".split(" "),
};

/** "" means "use my initials". */
export const AVATAR_EMOJIS = ["", ..."🦊 🐼 🐸 🐙 🦄 🐧 🐨 🦁 🐯 🐵 🦉 🐢 🐳 🦖 🐝 🦋 🐞 🦀 🐬 🦜 🐹 🐰 🦔 🐲".split(" ")];
export const AVATAR_COLORS = ["#2349b8", "#c2410c", "#2f7d4f", "#6d28d9", "#b45309", "#0e7490", "#be185d", "#4b5563"];
export const CLASS_EMOJIS = "📚 🧪 🧮 🌍 🎨 💻 🎵 🔭 📐 🧠 ✏️ 🏫 ⚽ 🎭 📜 🧬".split(" ");

export function composerPlaceholder(channel) {
  if (!channel) return "Write a message…";
  if (channel.kind === "dm") return `Message ${channel.dmUser?.displayName ?? ""}`.trim();
  return `Message #${channel.name}`;
}

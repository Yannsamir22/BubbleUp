const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  senderUsername: { type: String, required: true },
  recipientUsername: { type: String, default: null },
  messageType: { 
    type: String, 
    required: true, 
    enum: ['public', 'whisper', 'bot_command', 'bot_response', 'broadcast'] 
  },
  content: { type: String, required: true },
  isDeleted: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);
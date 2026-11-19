const Message = require('../model/message');

async function storeMessage({
    userId,
    senderUsername,
    recipientUsername = null,
    messageType,
    content,
}) {
    try {
        const newMessage = new Message({
            userId: userId || null,
            senderUsername,
            recipientUsername,
            messageType,
            content
        });
        return await newMessage.save();
    } catch (error) {
        console.error('DB storeMessage Error:', error.message);
        throw error;
    }
}

async function getRecentMessages(limit = 100) {
    return await Message.find({
        messageType: { $in: ["public", "bot_response", "bot_command", "broadcast", "whisper"] },
        isDeleted: false,
    })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
}

async function markMessageAsDeleted(messageId, userId) {
    const result = await Message.findOneAndUpdate(
        { _id: messageId, userId: userId, isDeleted: false },
        { $set: { isDeleted: true } },
        { new: false }
    );
    if (!result) {
        throw new Error("Permission denied or message not found/already deleted.");
    }
    return { id: messageId };
}

async function markMessageAsDeletedByAdmin(messageId) {
    const result = await Message.findOneAndUpdate(
        { _id: messageId, isDeleted: false },
        { $set: { isDeleted: true, content: "[deleted by admin]" } },
        { new: false }
    );
    if (!result) {
        throw new Error("Message not found or already deleted.");
    }
    return { id: messageId };
}

module.exports = {
    storeMessage,
    getRecentMessages,
    markMessageAsDeleted,
    markMessageAsDeletedByAdmin
};
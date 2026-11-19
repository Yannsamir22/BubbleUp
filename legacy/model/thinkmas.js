const mongoose = require('mongoose');

const learnResponsesSchema = mongoose.Schema({
    question:{
        type: String,
        required: true
    },
    answer:{
        type: String,
        required: true
    },
    timestamp:{
        type: Date,
        default: Date.now()
    
    }
});

const knowledge = mongoose.model('Knowledge', learnResponsesSchema);
module.exports = {knowledge};
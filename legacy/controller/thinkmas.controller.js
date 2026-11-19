const Knowledge = require('../model/thinkmas');

async function response(req, res) {
      const userMessage = req.body.question;
  try {
    const findResponse = await Knowledge.findOne({ question: userMessage });
    setTimeout(() => {
      console.log(userMessage)
      if (findResponse) {
        
        res.json({ answer: findResponse.answer });
      } else {
        res.json({ answer: "I'm sorry, I don't understand that." });
      }
    }, 500);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = { response };
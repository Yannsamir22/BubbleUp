const express = require('express');
const mongoose = require('mongoose');
const app = express();
const port = 8000;
const {knowledge} = require('./model/thinkmas'); // Assure-toi que le chemin est correct

// Connexion à MongoDB
mongoose.connect('mongodb://localhost:27017/thinkmas', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Route chat
app.post('/chat', async (req, res) => {
  const userMessage = req.body.question;
  try {
    const findResponse = await knowledge.findOne({ question: userMessage });
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
});

// Route pour ajouter une question/réponse
app.post('/reponse', async (req, res) => {
  const { question, answer } = req.body;
  if (question && answer) {
    try {
      await knowledge.create({ question: question.toLowerCase(), answer });
      res.json({ message: 'Question and answer stored successfully' });
    } catch (err) {
      res.status(500).json({ error: 'Database error' });
    }
  } else {
    res.status(400).json({ error: 'Both question and answer are required' });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

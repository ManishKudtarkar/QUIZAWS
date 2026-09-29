// A default quiz used when a host starts a game without providing their own.
module.exports = {
  title: "General Knowledge",
  questions: [
    {
      text: "What is the capital of France?",
      answers: ["London", "Paris", "Berlin", "Madrid"],
      correctIndex: 1,
      timeLimit: 20,
    },
    {
      text: "Which planet is known as the Red Planet?",
      answers: ["Venus", "Jupiter", "Mars", "Saturn"],
      correctIndex: 2,
      timeLimit: 20,
    },
    {
      text: "What is 7 x 8?",
      answers: ["54", "56", "62", "48"],
      correctIndex: 1,
      timeLimit: 15,
    },
    {
      text: "Who wrote 'Romeo and Juliet'?",
      answers: ["Charles Dickens", "Mark Twain", "William Shakespeare", "Jane Austen"],
      correctIndex: 2,
      timeLimit: 20,
    },
    {
      text: "What is the largest ocean on Earth?",
      answers: ["Atlantic", "Indian", "Arctic", "Pacific"],
      correctIndex: 3,
      timeLimit: 20,
    },
  ],
};

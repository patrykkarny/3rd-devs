import OpenAI from 'openai';

import { JSDOM } from 'jsdom';

const getQuestion = async () => {
  const response = await fetch('https://xyz.ag3nts.org/').then((res) =>
    res.text(),
  );

  const dom = new JSDOM(response);
  const doc = dom.window.document;

  const question = doc
    .querySelector('#human-question')
    ?.textContent?.split(':')[1]
    .trim();

  console.log('question', question);

  return question || '';
};

const getAnswer = async (question: string) => {
  const openai = new OpenAI();

  const chatCompletion = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content:
          "Your job is to only answer the question. If you don't know the answer, say 'I don't know'",
      },
      {
        role: 'user',
        content: question,
      },
    ],
    model: 'gpt-4o',
    response_format: { type: 'text' },
  });

  const answer = chatCompletion.choices[0].message.content;

  console.log('answer', answer);

  return answer || '';
};

const postAnswer = async (answer: string) => {
  const formData = new FormData();

  formData.append('answer', answer);
  formData.append('username', 'tester');
  formData.append('password', '574e112a');

  const response = await fetch('https://xyz.ag3nts.org/', {
    method: 'POST',
    body: formData,
  }).then((res) => res.text());

  console.log('response', response);
};

const question = await getQuestion();
const answer = await getAnswer(question);
await postAnswer(answer);

import OpenAI from 'openai';

const openai = new OpenAI();

const getData = async (): Promise<{ description: string }> => {
  const response = await fetch(
    `https://centrala.ag3nts.org/data/${process.env.API_KEY}/robotid.json`,
  ).then((res) => res.json());

  return response;
};

const generateImage = async (data: string) => {
  const response = await openai.images.generate({
    model: 'dall-e-3',
    size: '1024x1024',
    prompt: `
      A robot that matches the description, no text.
      <description>${data}</description>`,
  });

  return response.data[0].url || '';
};

const sendAnswer = async (imageUrl: string) => {
  const response = await fetch('https://centrala.ag3nts.org/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apikey: process.env.API_KEY,
      task: 'robotid',
      answer: imageUrl,
    }),
  }).then((res) => res.json());

  return response;
};

const data = await getData();
console.log(data);
const imageUrl = await generateImage(data.description);
console.log(imageUrl);
const response = await sendAnswer(imageUrl);
console.log(response);

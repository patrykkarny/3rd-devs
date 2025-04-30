import OpenAI from 'openai';

const getData = async (): Promise<string> => {
  const response = await fetch(
    `https://centrala.ag3nts.org/data/${process.env.API_KEY}/cenzura.txt`,
  ).then((res) => res.text());

  return response;
};

const obfuscateString = async (data: string) => {
  const openai = new OpenAI();

  const response = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `
      You are a helpful assistant.
      Your job is to obfuscate any sensitive data with word "CENZURA".

      <rule>
        - You can only obfuscate the provided values.
        - Do not change the original string, only replace the sensitive data with "CENZURA" word.
        - Keep all the punctuation marks and whitespaces in original format
        - Make sure to replace first name & last name, street name & street number, city, age with the "CENZURA" word.
      </rule>

      <example>
        Example 1
        USER: Dane osoby podejrzanej: Paweł Zieliński. Zamieszkały w Warszawie na ulicy Pięknej 5. Ma 28 lat.
        ASSISTANT:Dane osoby podejrzanej: CENZURA. Zamieszkały w CENZURA na ulicy cenzura. Ma CENZURA lat.

        Example 2
        USER: Dane personalne podejrzanego: Wojciech Górski. Przebywa w Lublinie, ul. Akacjowa 7. Wiek: 27 lat.
        ASSISTANT: Dane personalne podejrzanego: CENZURA. Przebywa w CENZURA, ul. CENZURA. Wiek: CENZURA lat.

        Example
        USER: Podejrzany nazywa się Tomasz Kaczmarek. Jest zameldowany w Poznaniu, ul. Konwaliowa 18. Ma 25 lat.
        ASSISTANT: Podejrzany nazywa się CENZURA. Jest zameldowany w CENZURA, ul. CENZURA. Ma CENZURA lat.
      </example>
    `,
      },
      {
        role: 'user',
        content: data,
      },
    ],
    model: 'gpt-4o',
    response_format: { type: 'text' },
  });

  return response.choices[0].message.content;
};

const document = await getData();
const obfuscatedData = await obfuscateString(document);

console.log(obfuscatedData);

const response = await fetch('https://centrala.ag3nts.org/report ', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    apikey: process.env.API_KEY,
    task: 'CENZURA',
    answer: obfuscatedData,
  }),
}).then((res) => res.json());

console.log('response', response);

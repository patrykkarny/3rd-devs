import { create, all } from 'mathjs';
import OpenAI from 'openai';

const math = create(all);

type Document = {
  apikey: string;
  description: string;
  copyright: string;
  'test-data': {
    question: string;
    answer: number;
    test: {
      q: string;
      a: string;
    };
  }[];
};

const getDocument = async (): Promise<Document> => {
  const response = await fetch(
    `https://centrala.ag3nts.org/data/${process.env.API_KEY}/json.txt`,
  ).then((res) => res.text());

  return JSON.parse(response);
};

const fixDocumentCalculations = (document: Document) => ({
  ...document,
  'test-data': document['test-data'].map((data) => ({
    ...data,
    answer: math.evaluate(data.question),
  })),
});

const answerMissingQuestions = async (document: Document) => {
  const missingQuestions = document['test-data']
    .map((data, index) => ({
      ...data,
      index,
    }))
    .filter((data) => !!data.test);

  const openai = new OpenAI();

  console.log('missingQuestions', missingQuestions);

  const response = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `
      You are a helpful assistant.
      Your job is to answer a set of question asked by the user in one response.

      <rule>
        - You can only answer the questions asked by the user.
        - You can answer multiple questions in one response.
        - You should output the response in JSON format.
        - The json should have an "answers" property which is an array of objects.
        - Each object should have "index", "q" and "a" properties, where "index" property is the index of the question sent by the user, "q" is the question and "a" is the answer.
      </rule>

      <example>
        Example 1
        USER:
        Index: 20
        Question: What is the capital city of France?

        Index: 24
        Question: What is the capital city of Spain?

        Index: 30
        Question: name of the 2020 USA president

        ASSISTANT:
        {
          "answers": [{
            "index": 20,
            "q": "What is the capital city of France?",
            "a": "Paris"
          },
          {
            "index": 24,
            "q": "What is the capital city of Spain?",
            "a": "Madrid"
          },
          {
            "index": 30,
            "q": "name of the 2020 USA president",
            "a": "Joe Biden"
          }]
        }

        Example 2
        USER:
        Index: 1
        Question: 2 + 2

        Index: 2
        Question: 3 + 3

        Index: 3
        Question: 4 + 4

        ASSISTANT:
        {
          "answers": [{
            "index": 1,
            "q": "2 + 2",
            "a": 4
          },
          {
            "index": 2,
            "q": "3 + 3",
            "a": 6
          },
          {
            "index": 3,
            "q": "4 + 4",
            "a": 8
          }]
        }
      </example>
    `,
      },
      {
        role: 'user',
        content: missingQuestions
          .map((data) => `Index: ${data.index}\nQuestion: ${data.test.q}`)
          .join('\n\n'),
      },
    ],
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
  });

  const { answers } = JSON.parse(response.choices[0].message.content || '{}');

  return {
    ...document,
    'test-data': document['test-data'].map((data, index) => {
      const answer = answers.find((answer: any) => answer.index === index);

      if (!answer) return data;

      return {
        ...data,
        test: {
          ...data.test,
          a: answer.a,
        },
      };
    }),
  };
};

const document = await getDocument();
const documentWithFixedCalculations = fixDocumentCalculations(document);
const documentWithAnswers = await answerMissingQuestions(
  documentWithFixedCalculations,
);

console.log(documentWithAnswers);

const response = await fetch('https://centrala.ag3nts.org/report', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    apikey: process.env.API_KEY,
    task: 'JSON',
    answer: {
      ...documentWithAnswers,
      apikey: process.env.API_KEY,
    },
  }),
}).then((res) => res.json());

console.log('response', response);

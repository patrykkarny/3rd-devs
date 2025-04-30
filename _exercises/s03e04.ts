import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

const openai = new OpenAI();

const getNote = async () => {
  const notePath = path.join(__dirname, 'barbara.txt');
  const isNoteExists = await fs.exists(notePath);

  if (isNoteExists) {
    return fs.readFile(notePath, 'utf-8');
  }

  const response = await fetch(
    'https://centrala.ag3nts.org/dane/barbara.txt',
  ).then((res) => res.arrayBuffer());

  await fs.writeFile(notePath, Buffer.from(response));

  return Buffer.from(response).toString();
};

const queryAPI = async (path: string, query: string) => {
  const response = await fetch(`https://centrala.ag3nts.org${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, apikey: process.env.API_KEY }),
  }).then((res) => res.json());

  console.log(response);

  return response;
};

// await queryAPI('/places', 'KRAKOW')

const analyzeNote = async (history: string): Promise<{
  _thinking: string;
  action: 'PEOPLE' | 'PLACES' | null;
  query: string | null;
  final_answer: string | null;
}> => {
  const note = await getNote();

  console.log(`Current history: \n${history}`);

  const response = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `
        You are a helpful assistant trained to analyze the text and find city name of the people who were last seen in.
        Your job is to find the city name where Barbara Zawadzka was last seen.

        <prompt_rules>
          - ANALYZE the provided note and history to find the city name where Barbara Zawadzka was last seen
          - USE external tools in case you can not find the city name based on provided note or history
          - first tool PEOPLE is the API which you can query with a single FIRST NAME, it can return the city names where the person was last seen
          - second tool PLACES is the API which you can query with a single CITY NAME, it can return the information about the people who were last seen in the city
          - USE the response from PEOPLE tool to create another query, for example if PEOPLE return LODZ and SZCZECIN, you can use LODZ or SZCZECIN as a query for PLACES
          - USE the response from PLACES tool to create another query, for example if PLACES return RAFAL and ADAM, you can use RAFAL or ADAM as a query for PEOPLE without any special characters
          - NEVER use the same PEOPLE or PLACES query in case of unsuccessful response
          - NEVER use the same PEOPLE or PLACES query again if the previous query had RESTRICTED DATA response
          - NEVER use the same final_answer again, if the previous answer was unsuccessful
          - output the answer as JSON object
          - output the final_answer in polish using capital letters and without any special characters, for example "KRAKOW", "WARSZAWA", "GDANSK", etc
        </prompt_rules>

        <note>
          ${note}
        </note>

        <history>
          ${history || 'No history yet'}
        </history>
      `,
      },
    ],
    model: 'gpt-4o',
    response_format: zodResponseFormat(
      z.object({
        _thinking: z.string({
          description:
            'Use to analyze the current note and history to provide the accurate answer. Think as long as possible to find the answer. Never use the same answer again if the previous answer was unsuccessful',
        }),
        action: z
          .enum(['PEOPLE', 'PLACES'], {
            description:
              'Use this if you need to perform additional action to find the city name, otherwise return null',
          })
          .nullable(),
        query: z
          .string({
            description:
              'If the additional action is needed use this field to provide the query to perform the action otherwise return null. The query should be a ONLY a FIRST_NAME or ONLY a CITY_NAME in polish language without any special characters, with capital letters and in denominator form, for example "BARBARA", "ALEKSANDER", "KRAKOW", "WARSZAWA", etc',
          })
          .nullable(),
        final_answer: z
          .string({
            description:
              'Use this field if you find the city name where Barbara Zawadzka was last seen',
          })
          .nullable(),
      }),
      'json_response',
    ),
  });

  const answer = JSON.parse(response.choices[0].message.content || '{}');

  console.log(answer);

  return answer;
};

const sendAnswer = async (answer: string) => {
  const response = await fetch('https://centrala.ag3nts.org/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apikey: process.env.API_KEY,
      task: 'loop',
      answer,
    }),
  }).then((res) => res.json());

  console.log(response);

  return response;
};

// code 0
const main = async () => {
  let history = '';
  let isFound = false;
  const maxAttempts = 40;
  let currentAttempt = 1;

  const actions = {
    PEOPLE: (query: string) => queryAPI('/people', query),
    PLACES: (query: string) => queryAPI('/places', query),
  };

  while (!isFound && currentAttempt <= maxAttempts) {
    const { action, query, final_answer } = await analyzeNote(history);

    if (final_answer) {
      const response = await sendAnswer(final_answer);

      if (response.code === 0) {
        console.log('The answer was successful!');
        isFound = true;
      } else {
        console.log('The answer was not successful!');
        history += `Current Attempt: ${currentAttempt}\nResponse unsuccessful, reason: ${response.message}\n\n`;
      }
    }

    if (action && query) {
      const response = await actions[action](query);

      history += `Current Attempt: ${currentAttempt}\nAction taken: ${action}\nQuery: ${query}\nResponse: ${response.message}\n\n`;
    }

    currentAttempt += 1;
  }
}

await main();
import fs from 'fs';
import OpenAI, { toFile } from 'openai';
import path from 'path';

const openai = new OpenAI();

const getFileNames = async (): Promise<string[]> => {
  // read audio files async from ./audio folder
  const files = await fs.promises.readdir(path.join(__dirname, 'audio'));

  console.log(files);

  return files;
};

const generateTranscriptions = async (files: string[]) => {
  const transcriptions = await Promise.all(
    files.map(async (file) => {
      const audioBuffer = await fs.promises.readFile(
        path.join(__dirname, 'audio', file),
      );

      return openai.audio.transcriptions.create({
        file: await toFile(audioBuffer, file),
        model: 'whisper-1',
        language: 'pl',
      });
    }),
  );

  return transcriptions.map((transcription) => transcription.text);
};

const findStreetName = async (transcriptions: string[]) => {
  const response = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `
      You are a helpful investigator.
      Your job is to find an university street address that Andrzej Maj was working at.

      <rules>
        - Use the provided transcriptions to find the university street address.
        - If you cannot find the street address in the transcriptions, use your general knowledge to find it.
        - Think before you return the street address, do not to return it if you are not sure.
        - return the answer in JSON format with "_thinking" and "answer" property
        - "_thinking" should be the first property within the JSON object
        - "answer" should be the second property within the JSON object
        - use "_thinking" to show the process of finding the answer
      </rules>

      <transcriptions>
        ${transcriptions.join('\n\n')}
      </transcriptions>
    `,
      },
      {
        role: 'user',
        content:
          'What is the street address of the university Andrzej Maj was working at?',
      },
    ],
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
  });

  const answer = JSON.parse(response.choices[0].message.content!);

  return answer;
};

const fileNames = await getFileNames();
const transcriptions = await generateTranscriptions(fileNames);
const streetName = await findStreetName(transcriptions);

console.log(streetName);

const response = await fetch('https://centrala.ag3nts.org/report ', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    apikey: process.env.API_KEY,
    task: 'mp3',
    answer: streetName.answer,
  }),
}).then((res) => res.json());

console.log('response', response);

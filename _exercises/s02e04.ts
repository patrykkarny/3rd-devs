import OpenAI, { toFile } from 'openai';
import fs from 'fs/promises';
import {join} from 'path';

const openai = new OpenAI();

type ExtractedData = {
  type: 'text' | 'image' | 'audio';
  file: string;
  data: string;
};

const getFiles = async (pathname: string): Promise<string[]> => {
  const files = await fs.readdir(join(__dirname, pathname));

  return files;
};

const getFile = async (pathname: string, fileName: string) => {
  const file = await fs.readFile(
    join(__dirname, pathname, fileName),
  ).catch(() => null);

  return file;
};

const writeFile = async (pathname: string, fileName: string, data: string) => {
  await fs.writeFile(join(__dirname, pathname, fileName), data);
}

const extractDataFromTextFile = async (
  fileName: string,
): Promise<ExtractedData> => {
  const file = await getFile('pliki_z_fabryki', fileName);

  return {
    type: 'text',
    file: fileName,
    data: file?.toString() || '',
  };
};

const extractDataFromImageFile = async (
  fileName: string,
): Promise<ExtractedData> => {
  const textFileName = fileName.replace('.png', '.txt');
  const textFile = await getFile('pliki_z_fabryki/output',textFileName);

  let extractedText;

  if (textFile) {
    extractedText = textFile.toString();
    console.log(`Text file ${textFileName} already exists`);
  } else {
    const file = await getFile('pliki_z_fabryki', fileName);
    const response = await openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `
            You are a helpful assistance trained to recognize the text on the image.
            Take a closer look at the image, and read all the text that is on the image.
            Return only the read text that is on the image and nothing else.
          `,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${file?.toString('base64')}`,
                detail: 'high',
              },
            },
            {
              type: 'text',
              text: 'What text is on the image?',
            },
          ],
        },
      ],
      model: 'gpt-4o',
    });

    extractedText = response.choices[0].message.content || '';
    await writeFile('pliki_z_fabryki/output',textFileName, extractedText);

    console.log(`Text file ${textFileName} created`);
  }

  return {
    type: 'image',
    file: fileName,
    data: extractedText,
  };
};

const extractDataFromAudioFile = async (
  fileName: string,
): Promise<ExtractedData> => {
  const textFileName = fileName.replace('.mp3', '.txt');
  const textFile = await getFile('pliki_z_fabryki/output',textFileName);

  let extractedText;

  if (textFile) {
    extractedText = textFile.toString();
    console.log(`Text file ${textFileName} already exists`);
  } else {
    const file = await getFile('pliki_z_fabryki',fileName);
    const response = await openai.audio.transcriptions.create({
      file: await toFile(file!, fileName),
      model: 'whisper-1',
    });

    extractedText = response.text;
    await writeFile('pliki_z_fabryki/output', textFileName, extractedText);

    console.log(`Text file ${textFileName} created`);
  }

  return {
    type: 'audio',
    file: fileName,
    data: extractedText,
  };
};

const extractData = async (fileName: string): Promise<ExtractedData | null> => {
  const isAudio = fileName.endsWith('.mp3');
  const isImage = fileName.endsWith('.png');
  const isText = fileName.endsWith('.txt');

  if (isAudio) return extractDataFromAudioFile(fileName);
  if (isImage) return extractDataFromImageFile(fileName);
  if (isText) return extractDataFromTextFile(fileName);

  return null;
};

const recognizeData = async (data: string): Promise<string | null> => {
  const response = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `
          You are a helpful assistant.

          Based on the provided context, your job is to recognize if the text is related to categories:
          - PEOPLE - ONLY captured or not but describing their hostile activity
          - HARDWARE - ONLY repaired hardware faults

          Rules:
          - Make sure to think before you return the answer, so the answer is correct.
          - Make sure to always stick to categories and nothing more.
          - The whole text context should be EXACTLY related to one of the categories and their description.
          - If the text related to PEOPLE category, return "people", if it is related HARDWARE category, return "hardware", otherwise return "unknown".
          - If there is only a mention about the people or hardware, it is not enough to return the category, return "unknown"
          - if the text is related to correct hardware work, return "unknown".
          - If you are not sure about the answer, return "unknown".
          - Only return a single word as an answer, do not return any additional information.
        `,
      },
      {
        role: 'user',
        content: `
          Is the text talking about the people or hardware?

          <context>${data}</context>
        `,
      },
    ],
    model: 'gpt-4o',
  });

  const answer = `${response.choices[0].message.content || ''}`.trim();

  if (answer === 'unknown') return null;

  return answer;
};

const processFiles = async () => {
  const files = await getFiles('pliki_z_fabryki');
  const extractedData = await Promise.all(
    files.map(async (file) => {
      const extractedData = await extractData(file);

      if (!extractedData) return null;

      const recognizedData = await recognizeData(extractedData.data);

      if (!recognizedData) return null;

      return {
        file,
        type: recognizedData,
      };
    }),
  );

  console.log(extractedData);

  const sortedData = extractedData
    .filter((data) => !!data)
    .reduce<Record<string, string[]>>(
      (acc, { file, type }) => {
        acc[type].push(file);

        return acc;
      },
      {
        people: [],
        hardware: [],
      },
    );

    return sortedData;
};

const sendResponse = async () => {
  const answer = await processFiles();

  console.log(answer);

  const response = await fetch('https://centrala.ag3nts.org/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apikey: process.env.API_KEY,
      task: 'kategorie',
      answer,
    }),
  }).then((res) => res.json());

  console.log(response);
}

sendResponse();
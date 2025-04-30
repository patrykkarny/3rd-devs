import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import OpenAI from 'openai';
import { QdrantClient } from '@qdrant/js-client-rest';

const openai = new OpenAI();
const vectorDB = new QdrantClient({
  url: process.env.QDRANT_URL,
});

const rootPath = path.join(__dirname, 'pliki_z_fabryki', 'do-not-share');
const collectionName = 'aidevs';


const initializeData = async () => {
  const files = await fs.readdir(rootPath);
  const collections = await vectorDB.getCollections();

  const isCollectionExist = collections.collections.some(
    (c) => c.name === collectionName,
  );

  if (isCollectionExist) return

  await vectorDB.createCollection(collectionName, {
    vectors: { size: 3072, distance: 'Cosine' },
  });


  const points = await Promise.all(
    files.map(async (file) => {
      const text = await fs.readFile(path.join(rootPath, file), 'utf-8');
      const embedding = await openai.embeddings.create({
        input: text,
        model: 'text-embedding-3-large',
      });

      console.log(embedding)

      return {
        id: uuidv4(),
        vector: embedding.data[0].embedding,
        payload: {
          text,
          date: file.split('.')[0].split('_').join('-'),
        },
      };
    }),
  );

  await vectorDB.upsert(collectionName, { points, wait: true });
};

const searchResult = async () => {
  const queryEmbedding = await openai.embeddings.create({
    input: 'W raporcie, z którego dnia znajduje się wzmianka o kradzieży prototypu broni?',
    model: 'text-embedding-3-large',
  })

  const searchResult = await vectorDB.search(collectionName, {
    vector: queryEmbedding.data[0].embedding,
    limit: 1,
    with_payload: true,
  })

  console.log(searchResult)

  return searchResult[0].payload
}

const sendAnswer = async (answer: string) => {
  const response = await fetch('https://centrala.ag3nts.org/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apikey: process.env.API_KEY,
      task: 'wektory',
      answer,
    }),
  }).then((res) => res.json());

  console.log(response);
}

await initializeData();
const result = await searchResult();
await sendAnswer(result?.date || '');

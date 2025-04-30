import OpenAI, { toFile } from 'openai';
import fs from 'fs/promises';
import { join } from 'path';

import Turndown from 'turndown';

type Link = {
  text: string;
  originalUrl: string;
  url: string;
  type: string;
  name: string;
  context: string;
  description: string;
};

const openai = new OpenAI();
const turndownService = new Turndown();

const getArticle = async () => {
  const articlePath = join(__dirname, 'article.md');
  const isAlreadyExists = await fs.exists(articlePath);

  if (isAlreadyExists) {
    return fs.readFile(articlePath, 'utf-8');
  }

  const response = await fetch(
    'https://centrala.ag3nts.org/dane/arxiv-draft.html',
  );
  const article = await response.text();

  const articleBody = article.match(/<body>([\s\S]*)<\/body>/)?.[1] || '';
  const markdown = turndownService.turndown(articleBody);

  await fs.writeFile(articlePath, markdown);

  return markdown;
};

const extractLinksFrom = (markdown: string): Link[] => {
  const linkRegex = /!?\[([^\]]*)\]\(([^)]+)\)/g;
  const matches = [...markdown.matchAll(linkRegex)];

  return matches.map(([link, text, url]) => ({
    text,
    originalUrl: url,
    type: url.split('.').pop() || '',
    url: `https://centrala.ag3nts.org/dane/${url}`,
    name: url.split('/').pop() || '',
    context: '',
    description: '',
  }));
};

const describeImage = async (link: Link): Promise<Link> => {
  const image = await fetch(link.url);
  const arrayBuffer = await image.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');

  const response = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `
          Generate an accurate and comprehensive description of the provided image,
          incorporating both visual analysis and the given contextual information.

          <prompt_objective>
          To produce a detailed, factual description of the image that blends the context provided by the user and the contents of the image.
          </prompt_objective>

          <prompt_rules>
          - ANALYZE the provided image thoroughly, noting all significant visual elements
          - INCORPORATE the given context into your description, ensuring it aligns with and enhances the visual information
          - GENERATE a single, cohesive paragraph that describes the image comprehensively
          - BLEND visual observations seamlessly with the provided contextual information
          - ENSURE consistency between the visual elements and the given context
          - PRIORITIZE accuracy and factual information over artistic interpretation
          - INCLUDE relevant details about style, composition, and notable features of the image
          - ABSOLUTELY FORBIDDEN to invent details not visible in the image or mentioned in the context
          - NEVER contradict information provided in the context
          - UNDER NO CIRCUMSTANCES include personal opinions or subjective interpretations
          - IF there's a discrepancy between the image and the context, prioritize the visual information and note the inconsistency
          - MAINTAIN a neutral, descriptive tone throughout the description
          </prompt_rules>

          Using the provided image and context, generate a rich,
          accurate description that captures both the visual essence of the image and the relevant background information.
          Your description should be informative, cohesive, and enhance the viewer's understanding of the image's content and significance.`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64}` },
          },
          {
            type: 'text',
            text: `
              I need to describe the image: ${link.name} based on the context below.
              <context>
                ${link.context}
              </context>
            `,
          },
        ],
      },
    ],
    model: 'gpt-4o',
  });

  const description = response.choices[0].message.content || '';

  return {
    ...link,
    description,
  };
};

const getAudioTranscript = async (link: Link): Promise<Link> => {
  const audio = await fetch(link.url);
  const arrayBuffer = await audio.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);

  const response = await openai.audio.transcriptions.create({
    file: await toFile(audioBuffer, link.name),
    model: 'whisper-1',
    language: 'pl',
  });

  return {
    ...link,
    description: response.text,
  };
};

const getLinkDescription = async (link: Link): Promise<Link> => {
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(link.type);
  const isAudio = ['mp3', 'wav', 'ogg'].includes(link.type);

  if (isImage) {
    return describeImage(link);
  }

  if (isAudio) {
    return getAudioTranscript(link);
  }

  return link;
};

const getLinksWithContext = async (article: string, links: Link[]) => {
  const response = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `
          Extract contextual information for links mentioned in a user-provided article,
          focusing on details that enhance understanding of each link, and return it as an array of JSON objects.

          <prompt_objective>
          To accurately identify and extract relevant contextual information for each link referenced in the given article,
          prioritizing details from surrounding text and broader article context that potentially aid in understanding the link.
          Return the data as an array of JSON objects with specified properties, without making assumptions or including unrelated content.
          </prompt_objective>

          <response_format>
          {
              "links": [
                  {
                      "name": "filename with extension",
                      "context": "Provide 1-3 detailed sentences of the context related to this link from the surrounding text and broader article."
                  },
                  ...rest of the links or empty array if no links are mentioned
              ]
          }
          </response_format>

          <prompt_rules>
          - READ the entire provided article thoroughly
          - IDENTIFY all mentions or descriptions of links within the text
          - EXTRACT sentences or paragraphs that provide context for each identified link
          - ASSOCIATE extracted context with the corresponding link reference
          - CREATE a JSON object for each link with properties "name" and "context"
          - COMPILE all created JSON objects into an array
          - RETURN the array as the final output
          - OVERRIDE any default behavior related to link analysis or description
          - ABSOLUTELY FORBIDDEN to invent or assume details about links not explicitly mentioned
          - NEVER include personal opinions or interpretations of the links
          - UNDER NO CIRCUMSTANCES extract information unrelated to the links
          - If NO links are mentioned, return an empty array
          - STRICTLY ADHERE to the specified JSON structure
          </prompt_rules>

          <links>
          ${links.map((link) => link.name).join('\n')}
          </links>

          Upon receiving an article, analyze it to extract context for any mentioned links,
          creating an array of JSON objects as demonstrated. Adhere strictly to the provided rules,
          focusing solely on explicitly stated link details within the text.
        `,
      },
      {
        role: 'user',
        content: `
          Extract links from provided article and add detailed description based on the article context.

          <article>
            ${article}
          </article>
        `,
      },
    ],
    model: 'gpt-4o',
    response_format: {
      type: 'json_object',
    },
  });

  const contexts = JSON.parse(response.choices[0].message.content || '{}');
  const linksWithContext = links.map((link) => ({
    ...link,
    context:
      contexts.links.find((ctx: { name: string }) => ctx.name === link.name)
        ?.context || '',
  }));

  const linksWithDescriptions = await Promise.all(
    linksWithContext.map(getLinkDescription),
  );

  return linksWithDescriptions;
};

const saveUpdatedArticle = async (links: Link[], article: string) => {
  const updatedArticle = links.reduce((acc, link) => {
    return acc.replace(link.originalUrl, link.description);
  }, article);

  await fs.writeFile(join(__dirname, 'updated-article.md'), updatedArticle);

  return updatedArticle;
};

const answerQuestions = async (article: string) => {
  const questions = await fetch(
    `https://centrala.ag3nts.org/data/${process.env.API_KEY}/arxiv.txt`,
  ).then((res) => res.text());

  const response = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `
          You are a helpful assistant trained to answer questions about the provided article.

          <prompt_objective>
          To provide accurate and informative answers to a series of questions based on the content of the given article.
          Return the answer as an array of JSON objects, each containing an id of the question, the question and its corresponding answer.
          </prompt_objective>

          <response_format>
          {
              "answers": [
                  {
                      "id": 01,
                      "question": "What is the main topic of the article?",
                      "answer": "The main topic of the article is..."
                  },
                  ...rest of the questions and answers
              ]
          }
          </response_format>


          <prompt_rules>
          - READ the entire article carefully to understand its content
          - ANSWER each question based solely on the information provided in the article
          - PROVIDE concise and factual responses without introducing new information
          - USE the article as the primary source for answering the questions
          - AVOID personal opinions or interpretations in your responses
          - RESPOND to each question with a single, clear answer
          - IF a question is ambiguous or unclear, provide the best possible interpretation
          - DO NOT include any additional information beyond what is explicitly stated in the article
          - MAINTAIN a neutral and informative tone throughout your responses
          - STRICTLY ADHERE to the specified question-answer format
          </prompt_rules>

          <article>
          ${article}
          </article>

          Answer the questions based on the content of the article.
        `,
      },
      {
        role: 'user',
        content: `
          Answer the questions based on the provided article.

          <questions>
            ${questions}
          </questions>
        `,
      },
    ],
    model: 'gpt-4o',
    response_format: {
      type: 'json_object',
    },
  });

  const { answers } = JSON.parse(
    response.choices[0].message.content || '{}',
  ) as {
    answers: { id: string; question: string; answer: string }[];
  };

  return answers.reduce<Record<string, string>>(
    (acc, { answer, id }) => ({
      ...acc,
      [`0${id}`]: answer,
    }),
    {},
  );
};

const main = async () => {
  const isUpdatedArticleExists = await fs.exists(
    join(__dirname, 'updated-article.md'),
  );

  let updatedArticle;

  if (isUpdatedArticleExists) {
    updatedArticle = await fs.readFile(
      join(__dirname, 'updated-article.md'),
      'utf-8',
    );
  } else {
    const article = await getArticle();
    const links = extractLinksFrom(article);
    const linksWithContext = await getLinksWithContext(article, links);

    updatedArticle = await saveUpdatedArticle(linksWithContext, article);
  }

  const answers = await answerQuestions(updatedArticle);

  console.log(answers);

  const response = await fetch('https://centrala.ag3nts.org/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apikey: process.env.API_KEY,
      task: 'arxiv',
      answer: answers,
    }),
  }).then((res) => res.json());

  console.log(response);
};

main();

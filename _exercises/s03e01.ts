import OpenAI from 'openai';
import { readdir, writeFile, exists, appendFile, readFile } from 'fs/promises';
import { join } from 'path';

// Opiszę jak można to rozwiązać:

// - wygenerować listę słów kluczowych dla każdego pliku z faktami
// - wygenerować listę słów kluczowych dla każdego z raportów, uwzględniając także dane z nazwy pliku (w praktyce wrzucam treść i nazwę pliku do kontekstu zapytania do LLM)
// - sprawdzić jakiej osoby tyczy się raport
// - znaleźć odpowiednie fakty dla tej osoby
// - połączyć słowa kluczowe z raportu i z faktów dla tej osoby i to wysłać jako wynik dla danego raport

// Można też w ten sposób:

// - wygenerować listę osób dla każdego z faktów
// - sprawdzić jakiej osoby tyczy się raport
// - sprawdzić jakie fakty tyczą się tej osoby
// - włożyć do kontekstu LLM raport, odpowiadające mu fakty, nazwę pliku i z tego wszystkiego wygenerować słowa kluczowe

const openai = new OpenAI();

const generateReport = async () => {
  const rootPath = join(__dirname, 'pliki_z_fabryki');
  const documentsPath = join(rootPath, 'documents.md');
  const factsPath = join(rootPath, 'facts.md');

  const isDocumentsExists = await exists(documentsPath);
  const isFactsExists = await exists(factsPath);

  if (isDocumentsExists && isFactsExists) return;

  const documents = await readdir(rootPath);
  const textDocuments = documents.filter((doc) => doc.endsWith('.txt'));
  await writeFile(documentsPath, '# Documents\n\n');

  for (const doc of textDocuments) {
    const file = await readFile(join(rootPath, doc), 'utf-8');
    await appendFile(documentsPath, `## ${doc}\n\n${file}\n\n`);
  }

  const facts = await readdir(join(rootPath, 'facts'));
  const textFacts = facts.filter((fact) => fact.endsWith('.txt'));
  await writeFile(factsPath, '# Facts\n\n');

  for (const fact of textFacts) {
    const file = await readFile(join(rootPath, 'facts', fact), 'utf-8');
    await appendFile(factsPath, `## ${fact}\n\n${file}\n\n`);
  }
};

type Metadata = Record<string, { fact: string; content: string }[]>;

const generateMetadata = async (): Promise<Metadata> => {
  const rootPath = join(__dirname, 'pliki_z_fabryki');

  const metadataFile = join(rootPath, 'metadata.json');
  const isMetadataExists = await exists(metadataFile);

  if (isMetadataExists) {
    const metadata = await readFile(metadataFile, 'utf-8');
    const parsedMetadata = JSON.parse(metadata);

    console.log(parsedMetadata);

    return parsedMetadata;
  }

  const documents = await readdir(rootPath);
  const textDocuments = documents.filter((doc) => doc.endsWith('.txt'));

  const facts = await readFile(join(rootPath, 'facts.md'), 'utf-8');

  const metadata = {} as Record<string, { fact: string; content: string }[]>;

  for (const doc of textDocuments) {
    const file = await readFile(join(rootPath, doc), 'utf-8');

    const response = await openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `
            Your are a helpful assistant trained to analyze the reports and search for facts related to that report.

            <prompt_objective>
              Analyze the report and search for facts that are related to the specific report. Return the file names of the related facts.
            </prompt_objective>

            <prompt_rules>
              - ANALYZE provided report and find which facts are related to the specific report
              - return response as json object with "_thinking" and "facts" keys
              - "_thinking" key should be the first property, and you should use it to output in polish language your process of finding the related facts
              - "facts" a list of fact file names
              - return only the file names of the related facts
            </prompt_rules>

            <response_format>
              {
                "_thinking": "Use this field to think through the response and collect all the information about the facts for a specific report.",
                "facts": [
                  "file_name1.txt",
                  "file_name2.txt",
                  "file_name3.txt"
                ]
              }
            </response_format>

            <report>
              ${file}
            </report>

            <facts>
              ${facts}
            </facts>
          `,
        },
      ],
      model: 'gpt-4o',
      response_format: {
        type: 'json_object',
      },
    });

    const generated = JSON.parse(response.choices[0].message.content || '{}');

    console.log(generated);

    metadata[doc] = await Promise.all(
      generated.facts.map(async (factName: string) => ({
        fact: factName,
        content: await readFile(join(rootPath, 'facts', factName), 'utf-8'),
      })),
    );
  }

  console.log(metadata);

  await writeFile(join(rootPath, 'metadata.json'), JSON.stringify(metadata));

  return metadata;
};

const generateKeywords = async (metadata: Metadata) => {
  const rootPath = join(__dirname, 'pliki_z_fabryki');
  const documents = await readdir(rootPath);
  const textDocuments = documents.filter((doc) => doc.endsWith('.txt'));

  const keywords = {} as Record<string, string>;

  for (const doc of textDocuments) {
    const file = await readFile(join(rootPath, doc), 'utf-8');

    const response = await openai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `
            You are a helpful assistant trained to generate keywords for a specific report.
            The keywords are going to be used as a report metadata and saved alongisde the report in vector database.
            Your job is to generate as many keywords as possible based on the provided report and related facts.

            <prompt_objective>
              Generate keywords for the report and facts. There should be as many keywords as possible to describe the content of the report.
            </prompt_objective>

            <prompt_rules>
              - ANALYZE all provided data, the report and related facts
              - the keywords should be generated as denominator
              - the keywords should be generated in polish language
              - the keywords should be generated in a list format separated by commas
              - the keywords should be generated for filename as well, which includes the date, the report number and the place
              - return response as json object with "keywords" property which is a list
              - generate as many keywords as possible based on the collected information and chunk
            </prompt_rules>

            <response_format>
              {
                "keywords": [
                  "keyword1",
                  "keyword2",
                  "keyword3"
                ]
              }
            </response_format>

            <report>
              Report name: ${doc}
              ${file}
            </report>

            <facts>
              ${metadata[doc]
                .map(({ fact, content }) => `${fact}\n${content}`)
                .join('\n\n')}
            </facts>
          `,
        },
      ],
      model: 'gpt-4o',
      response_format: {
        type: 'json_object',
      },
    });

    const generated = JSON.parse(response.choices[0].message.content || '{}');

    console.log(generated);

    keywords[doc] = generated.keywords.join(', ');
  }

  console.log(keywords);

  return keywords;
};

const sendAnswer = async (answer: Record<string, string>) => {
  const response = await fetch('https://centrala.ag3nts.org/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apikey: process.env.API_KEY,
      task: 'dokumenty',
      answer,
    }),
  }).then((res) => res.json());

  console.log(response);
};

generateReport();
const metadata = await generateMetadata();
const keywords = await generateKeywords(metadata);
sendAnswer(keywords);

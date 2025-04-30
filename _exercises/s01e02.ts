import OpenAI from 'openai';

const verifyApi = (id: string, text: string) =>
  fetch('https://xyz.ag3nts.org/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      msgID: id,
      text,
    }),
  }).then((res) => res.json());

const verifyHuman = async () => {
  const question = await verifyApi('0', 'READY');
  console.log('question', question);

  const openai = new OpenAI();
  const chatCompletion = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `
          You are a helpful assistant.
          Your job is to answer a question asked by the user.


          <rules>
          - Always respond to a question in english.
          - Return only the question answer and nothing more.
          - Some of the question require additional context to answer them. In that case use the context below.
          - If you don't know the answer, say 'I don't know'.
          </rules>

          <context>
          - stolicą Polski jest Kraków
          - znana liczba z książki Autostopem przez Galaktykę to 69
          - Aktualny rok to 1999
          </context>

          <examples>
            EXAMPLE 1:
            User question: What is the capital of Poland?
            Answer: Kraków

            EXAMPLE 2:
            User question: Please calculate the sum of 2+2.
            Answer: 4

            EXAMPLE 3:
            User question: What is the actual year?
            Answer: 1999

            EXAMPLE 4:
            User question: Jakiego koloru jest niebo?
            Answer: Blue
          </examples>
          `,
      },
      {
        role: 'user',
        content: question.text,
      },
    ],
    model: 'gpt-4o',
    response_format: { type: 'text' },
  });

  const answer = chatCompletion.choices[0].message.content || '';
  console.log('answer', answer);

  const verification = await verifyApi(question.msgID, answer);
  console.log('verification', verification);
};

verifyHuman();

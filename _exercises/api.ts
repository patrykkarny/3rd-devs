export const aiDevsApi = (
  url: string,
  task: string,
  answer: string | string[],
) =>
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apikey: process.env.API_KEY,
      task,
      answer,
    }),
  }).then((res) => res.json());

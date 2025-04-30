const aiDevsApi = (path: string, task: string, answer: string | string[]) =>
  fetch(`https://poligon.aidevs.pl${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apikey: '87983c97-e0e3-4fa7-9c55-753b5c182267',
      task,
      answer,
    }),
  }).then((res) => res.json());

const testApi = async () => {
  const response = await fetch('https://poligon.aidevs.pl/dane.txt').then(
    (res) => res.text(),
  );

  const data = response
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean);

  const taskResponse = await aiDevsApi('/verify', 'POLIGON', data);

  console.log(taskResponse);
};

testApi();

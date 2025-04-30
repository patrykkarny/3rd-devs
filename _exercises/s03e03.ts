import OpenAI from 'openai';

const getDbClient = () => ({
  query: async (query: string, log = false) =>
    fetch('https://centrala.ag3nts.org/apidb', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        task: 'database',
        apikey: process.env.API_KEY,
        query,
      }),
    }).then(async (res) => {
      const json = await res.json();

      if (log) console.log(json);

      return json;
    }),
});

const dbClient = getDbClient();
const openai = new OpenAI();

const getSql = async (query: string) => {
  const tables = await dbClient.query('show tables');

  const schemas = await Promise.all(
    tables.reply.map((table: any) => {
      return dbClient.query(`show create table ${table['Tables_in_banan']}`);
    }),
  );

  const dbSchema = schemas
    .map(
      (schema: any) => `
    Table name: ${schema.reply[0].Table}\n
    Table created by: ${schema.reply[0]['Create Table']}`,
    )
    .join('\n\n');

  const response = await openai.chat.completions.create({
    messages: [
      {
        role: 'system',
        content: `
        You are a helpful assistant that provides SQL queries for a given natural language query.

        <prompt_objective>
          Based on the user query, generate a SQL query that retrieves the data from the database.
          Analyze the DB schema first in order to output the valid SQL query.
        </prompt_objective>

        <prompt_rules>
          - You can only output SQL query and noting else.
          - If the user doesn't ask for a SQL query, say "I'm sorry, I can only provide SQL queries."
          - You can only output valid SQL queries for the given tables and tables schema.
          - The user can ask to generate the query in polish or english.
          - you can do whenever joins possible to output the valid sql query
          - output the answer in JSON object with the keys "_thinking" and "sql"
          - "_thinking" should be the first key in the JSON object and you should use it to analyze the DB schema first before outputting the SQL query
          - "sql" should be the second key in the JSON object and you should use it to output the SQL query
        </prompt_rules>

        <response_example>
          User: "What are the active datacenters?"
          Assistant:
          {
            "_thinking": "Based on the DB schema, I can see that the datacenters table has a column 'is_active' that can be used to filter the active datacenters.",
            "sql": "SELECT * FROM datacenters WHERE is_active = 1"
          }
        </response_example>

        <db_schema>
          ${dbSchema}
        </db_schema>
      `,
      },
      {
        role: 'user',
        content: query,
      },
    ],
    model: 'gpt-4o',
    response_format: {
      type: 'json_object',
    },
  });

  const json = JSON.parse(response.choices[0].message.content || '{}');

  console.log(json);

  return json.sql;
};

const sendAnswer = async (sql: string) => {
  const dbResult = await dbClient.query(sql, true);

  const response = await fetch('https://centrala.ag3nts.org/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apikey: process.env.API_KEY,
      task: 'database',
      answer: dbResult.reply.map((row: any) => row.dc_id),
    }),
  }).then((res) => res.json());

  console.log(response);

  return response;
};

const sql = await getSql(
  'które aktywne datacenter (DC_ID) są zarządzane przez pracowników, którzy są na urlopie (is_active=0)',
);
await sendAnswer(sql);

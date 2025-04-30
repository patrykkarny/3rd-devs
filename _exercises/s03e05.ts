import neo4j from 'neo4j-driver';
import fs from 'fs/promises';
import path from 'path';

const driver = neo4j.driver(
  process.env.NEO4J_URI || '',
  neo4j.auth.basic(
    process.env.NEO4J_USER || '',
    process.env.NEO4J_PASSWORD || '',
  ),
);

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

const geUsersData = async () => {
  const isUserDataExists = await fs.exists(path.join(__dirname, 'users.json'));

  if (isUserDataExists) {
    return JSON.parse(
      await fs.readFile(path.join(__dirname, 'users.json'), 'utf-8'),
    );
  }

  const { reply: users } = await dbClient.query('select * from users');

  await fs.writeFile(
    path.join(__dirname, 'users.json'),
    JSON.stringify(users, null, 2),
  );

  return users;
};

export const getConnectionsData = async () => {
  const isConnectionsDataExists = await fs.exists(
    path.join(__dirname, 'connections.json'),
  );

  if (isConnectionsDataExists) {
    return JSON.parse(
      await fs.readFile(path.join(__dirname, 'connections.json'), 'utf-8'),
    );
  }

  const { reply: connections } = await dbClient.query(
    'select * from connections',
  );

  await fs.writeFile(
    path.join(__dirname, 'connections.json'),
    JSON.stringify(connections, null, 2),
  );

  return connections;
};

const importData = async () => {
  const users = await geUsersData();
  const connections = await getConnectionsData();

  const session = driver.session();

  try {
    for (const user of users) {
      await session.run(
        `CREATE (u:User {
              id: $id,
              username: $username,
              access_level: $access_level,
              is_active: $is_active,
              lastlog: $lastlog
          })`,
        user,
      );
    }

    // Import connections
    for (const connection of connections) {
      await session.run(
        `MATCH (u1:User {id: $user1_id}), (u2:User {id: $user2_id})
           CREATE (u1)-[:KNOWS]->(u2)`,
        connection,
      );
    }
  } catch (error) {
    console.log(error);
  } finally {
    await session.close();
  }
};

const checkIfDataExists = async () => {
  const session = driver.session();

  try {
    const result = await session.run('MATCH (u:User) RETURN count(u)');
    const count = result.records[0].get('count(u)').toNumber();

    return count > 0;
  } catch (error) {
    return false;
  } finally {
    await session.close();
  }
};

async function findShortestPathByName(username1: string, username2: string) {
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH path = shortestPath((u1:User {username: $username1})-[*]-(u2:User {username: $username2}))
             RETURN path, length(path) as pathLength`,
      { username1, username2 },
    );

    if (!result.records.length) {
      console.log(`No path found between users ${username1} and ${username2}`);

      return '';
    }

    const path = result.records[0].get('path');
    const pathLength = result.records[0].get('pathLength').toNumber();

    console.log(`\nShortest path between ${username1} and ${username2}:`);
    console.log(`Path length: ${pathLength} connections`);

    // Extract and display the path details
    const segments = path.segments;

    // Get usernames from segments with comma separated
    const usernames = new Set(
      segments.flatMap((segment: any) => {
        const startUsername = segment.start.properties.username;
        const endUsername = segment.end.properties.username;
        return [startUsername, endUsername];
      }),
    );

    console.log(`Path: ${Array.from(usernames).join(',')}`);

    return Array.from(usernames).join(',');
  } catch (error) {
    console.error('Error finding shortest path:', error);

    return '';
  } finally {
    await session.close();
  }
}

const sendAnswer = async (answer: string) => {
  const response = await fetch('https://centrala.ag3nts.org/report', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      apikey: process.env.API_KEY,
      task: 'connections',
      answer,
    }),
  }).then((res) => res.json());

  console.log(response);

  return response;
};

const main = async () => {
  const isDataExists = await checkIfDataExists();

  if (!isDataExists) {
    await importData();
  }

  const answer = await findShortestPathByName('Rafał', 'Barbara');

  await sendAnswer(answer);

  driver.close();
};

main();

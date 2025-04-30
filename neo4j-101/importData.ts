import neo4j from 'neo4j-driver';
import users from '../_exercises/users.json';
import connections from '../_exercises/connections.json';

const driver = neo4j.driver(
  'bolt://localhost:7687',
  neo4j.auth.basic('neo4j', 'password'), // Replace with your credentials
);

async function checkIfDataExists(): Promise<boolean> {
  const session = driver.session();
  try {
    const result = await session.run('MATCH (u:User) RETURN count(u) as count');
    const count = result.records[0].get('count').toNumber();
    return count > 0;
  } finally {
    await session.close();
  }
}

async function importData() {
  const session = driver.session();

  try {
    // Check if data already exists
    const dataExists = await checkIfDataExists();
    if (dataExists) {
      console.log('Data already exists in the database. Skipping import.');
      return;
    }

    console.log('Starting data import...');

    // Import users
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

    console.log('Data import completed successfully!');
  } catch (error) {
    console.error('Error importing data:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

importData();

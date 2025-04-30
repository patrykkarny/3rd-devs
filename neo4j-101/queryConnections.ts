import neo4j from 'neo4j-driver';

const driver = neo4j.driver(
  'bolt://localhost:7687',
  neo4j.auth.basic('neo4j', 'password'), // Replace with your credentials
);

async function queryConnections(userId: string) {
  const session = driver.session();

  try {
    // Query direct connections (people who know the user)
    const directConnections = await session.run(
      `MATCH (u:User {id: $userId})<-[:KNOWS]-(friend:User)
             RETURN friend.username as username, friend.id as id`,
      { userId },
    );

    console.log('\nDirect connections (people who know user):');
    directConnections.records.forEach((record) => {
      console.log(`${record.get('username')} (ID: ${record.get('id')})`);
    });

    // Query mutual connections (people who know the same people as the user)
    const mutualConnections = await session.run(
      `MATCH (u:User {id: $userId})-[:KNOWS]->(friend:User)<-[:KNOWS]-(mutual:User)
             WHERE mutual.id <> $userId
             RETURN mutual.username as username, mutual.id as id,
                    COLLECT(friend.username) as commonFriends`,
      { userId },
    );

    console.log('\nMutual connections:');
    mutualConnections.records.forEach((record) => {
      console.log(`${record.get('username')} (ID: ${record.get('id')})`);
      console.log(`Common friends: ${record.get('commonFriends').join(', ')}`);
    });

    // Query second-degree connections (friends of friends)
    const secondDegreeConnections = await session.run(
      `MATCH (u:User {id: $userId})-[:KNOWS]->(friend:User)-[:KNOWS]->(friendOfFriend:User)
             WHERE NOT (u)-[:KNOWS]->(friendOfFriend) AND friendOfFriend.id <> $userId
             RETURN friendOfFriend.username as username, friendOfFriend.id as id,
                    COLLECT(friend.username) as connectingFriends`,
      { userId },
    );

    console.log('\nSecond-degree connections (friends of friends):');
    secondDegreeConnections.records.forEach((record) => {
      console.log(`${record.get('username')} (ID: ${record.get('id')})`);
      console.log(
        `Connected through: ${record.get('connectingFriends').join(', ')}`,
      );
    });
  } catch (error) {
    console.error('Error querying connections:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

async function findShortestPath(userId1: string, userId2: string) {
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH path = shortestPath((u1:User {id: $userId1})-[*]-(u2:User {id: $userId2}))
       RETURN path, length(path) as pathLength`,
      { userId1, userId2 },
    );

    if (result.records.length === 0) {
      console.log(`No path found between users ${userId1} and ${userId2}`);
      return;
    }

    const path = result.records[0].get('path');
    const pathLength = result.records[0].get('pathLength').toNumber();

    console.log(`\nShortest path between users ${userId1} and ${userId2}:`);
    console.log(`Path length: ${pathLength} connections`);

    // Extract and display the path details
    const segments = path.segments;
    console.log('\nPath details:');
    segments.forEach((segment: any, index: number) => {
      const startNode = segment.start.properties;
      const endNode = segment.end.properties;
      console.log(
        `${index + 1}. ${startNode.username} (ID: ${startNode.id}) -> ${
          endNode.username
        } (ID: ${endNode.id})`,
      );
    });
  } catch (error) {
    console.error('Error finding shortest path:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

async function findShortestPathByName(username1: string, username2: string) {
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH path = shortestPath((u1:User {username: $username1})-[*]-(u2:User {username: $username2}))
       RETURN path, length(path) as pathLength`,
      { username1, username2 },
    );

    if (result.records.length === 0) {
      console.log(`No path found between users ${username1} and ${username2}`);
      return;
    }

    const path = result.records[0].get('path');
    const pathLength = result.records[0].get('pathLength').toNumber();

    console.log(`\nShortest path between ${username1} and ${username2}:`);
    console.log(`Path length: ${pathLength} connections`);

    // Extract all nodes in the path
    const nodes = path.nodes;
    const usernames = nodes.map((node: any) => node.properties.username);

    console.log('\nPath:');
    console.log(usernames.join(' -> '));
  } catch (error) {
    console.error('Error finding shortest path:', error);
  } finally {
    await session.close();
    await driver.close();
  }
}

// Example usage
queryConnections('1'); // Replace with the user ID you want to query
findShortestPath('1', '5'); // Replace with the user IDs you want to find the path between
findShortestPathByName('Rafał', 'Barbara');

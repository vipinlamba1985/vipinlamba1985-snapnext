import { PEOPLE_REKOGNITION_ACTIONS } from '@/lib/people-rekognition-capabilities';

let clientPromise = null;

async function getClient() {
  if (!clientPromise) {
    clientPromise = import('@aws-sdk/client-rekognition').then(({ RekognitionClient }) => new RekognitionClient({
      region: process.env.AWS_REGION,
      credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      } : undefined,
    }));
  }
  return clientPromise;
}

async function send(commandName, input) {
  if (!PEOPLE_REKOGNITION_ACTIONS.includes(commandName)) throw new Error(`Unsupported People Intelligence action: ${commandName}`);
  const sdk = await import('@aws-sdk/client-rekognition');
  const Command = sdk[`${commandName}Command`];
  if (!Command) throw new Error(`AWS SDK command unavailable: ${commandName}`);
  const client = await getClient();
  return client.send(new Command(input));
}

export const peopleRekognition = {
  createCollection: (input) => send('CreateCollection', input),
  indexFaces: (input) => send('IndexFaces', input),
  searchFaces: (input) => send('SearchFaces', input),
  deleteFaces: (input) => send('DeleteFaces', input),
  deleteCollection: (input) => send('DeleteCollection', input),
};

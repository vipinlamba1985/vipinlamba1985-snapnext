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
  if (!PEOPLE_REKOGNITION_ACTIONS.includes(commandName)) {
    throw new Error(`Unsupported People Intelligence action: ${commandName}`);
  }
  const sdk = await import('@aws-sdk/client-rekognition');
  const Command = sdk[`${commandName}Command`];
  if (!Command) throw new Error(`AWS SDK command unavailable: ${commandName}`);
  const client = await getClient();
  return client.send(new Command(input));
}

export const peopleRekognition = {
  createCollection: (input) => send('CreateCollection', input),
  describeCollection: (input) => send('DescribeCollection', input),
  deleteCollection: (input) => send('DeleteCollection', input),
  detectFaces: (input) => send('DetectFaces', input),
  compareFaces: (input) => send('CompareFaces', input),
  indexFaces: (input) => send('IndexFaces', input),
  searchFaces: (input) => send('SearchFaces', input),
  searchFacesByImage: (input) => send('SearchFacesByImage', input),
  listFaces: (input) => send('ListFaces', input),
  deleteFaces: (input) => send('DeleteFaces', input),
  createUser: (input) => send('CreateUser', input),
  associateFaces: (input) => send('AssociateFaces', input),
  disassociateFaces: (input) => send('DisassociateFaces', input),
  searchUsers: (input) => send('SearchUsers', input),
  searchUsersByImage: (input) => send('SearchUsersByImage', input),
  listUsers: (input) => send('ListUsers', input),
  deleteUser: (input) => send('DeleteUser', input),
  startFaceDetection: (input) => send('StartFaceDetection', input),
  getFaceDetection: (input) => send('GetFaceDetection', input),
  startFaceSearch: (input) => send('StartFaceSearch', input),
  getFaceSearch: (input) => send('GetFaceSearch', input),
};

export async function probePeopleCapabilities({ collectionId }) {
  const checks = [];
  try {
    const described = await peopleRekognition.describeCollection({ CollectionId: collectionId });
    checks.push({ action: 'DescribeCollection', ok: true, faceCount: Number(described.FaceCount || 0), userCount: Number(described.UserCount || 0) });
  } catch (error) {
    checks.push({ action: 'DescribeCollection', ok: false, error: error?.name || 'failed' });
  }
  return checks;
}

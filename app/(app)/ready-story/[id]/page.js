import ReadyStoryEditor from '@/components/ready-stories/ReadyStoryEditor';

export default async function ReadyStoryPage({ params }) {
  const { id } = await params;
  return <ReadyStoryEditor storyId={id} />;
}

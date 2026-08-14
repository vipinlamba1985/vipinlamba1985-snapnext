import ReadyStoryEditor from '@/components/ready-stories/ReadyStoryEditor';
import ReadyStorySmartShowcase from '@/components/ready-stories/ReadyStorySmartShowcase';

export default async function ReadyStoryPage({ params }) {
  const { id } = await params;
  return <>
    <ReadyStorySmartShowcase storyId={id} />
    <div className="legacy-ready-story-editor"><ReadyStoryEditor storyId={id} /></div>
    <style>{`
      .legacy-ready-story-editor > div > header { display: none !important; }
      .legacy-ready-story-editor > div > div.grid > div:first-child { display: none !important; }
      .legacy-ready-story-editor > div > div.grid { grid-template-columns: minmax(0, 1fr) !important; }
      .legacy-ready-story-editor > div > div.grid > section > div:first-child { display: none !important; }
    `}</style>
  </>;
}

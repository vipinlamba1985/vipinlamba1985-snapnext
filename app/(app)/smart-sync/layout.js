import OtherCloudPanel from '@/components/smart-sync/OtherCloudPanel';

export default function SmartSyncLayout({ children }) {
  return <>
    {children}
    <div className="mx-auto -mt-10 max-w-5xl pb-16">
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
        <div>
          <h2 className="text-lg font-black">Need another cloud or storage source?</h2>
          <p className="mt-1 text-sm leading-6 text-white/50">Import files immediately or tell SnapNext which verified connector should be built next.</p>
        </div>
        <OtherCloudPanel />
      </section>
    </div>
  </>;
}

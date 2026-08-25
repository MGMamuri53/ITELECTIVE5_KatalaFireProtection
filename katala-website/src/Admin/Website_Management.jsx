import { Globe2, Image, Megaphone, Save } from 'lucide-react';

const websiteSections = [
  { name: 'Homepage hero', status: 'Published', owner: 'Admin' },
  { name: 'Product catalog visibility', status: 'Needs review', owner: 'Inventory' },
  { name: 'Company profile', status: 'Published', owner: 'Admin' },
  { name: 'Contact information', status: 'Published', owner: 'Admin' },
];

function WebsiteManagement() {
  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Website Content</h1>
          <p className="text-slate-500">Manage public website copy, featured materials, banners, contact details, and page visibility.</p>
        </div>
        <button className="bg-[#b3000c] text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-[#8b000a] transition-colors">
          <Save className="w-4 h-4" /> Save changes
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <ContentCard icon={Globe2} title="Pages" value="5 active pages" copy="Control homepage, products, services, projects, and company profile content." />
        <ContentCard icon={Image} title="Featured media" value="12 assets" copy="Choose hero images and product/service visuals shown on the public website." />
        <ContentCard icon={Megaphone} title="Announcements" value="1 draft" copy="Publish temporary notices, promos, or maintenance announcements." />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Homepage quick edit</h2>
          <div className="space-y-4">
            <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" defaultValue="Practical fire protection for real facilities." />
            <textarea className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm min-h-28" defaultValue="Katala supports product supply, fire alarm work, sprinkler systems, pump installations, and preventive maintenance for facility requirements." />
            <input className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm" defaultValue="Request Quote" />
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900">Website sections</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {websiteSections.map((section) => (
              <div key={section.name} className="px-6 py-4">
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{section.name}</p>
                    <p className="text-xs text-slate-500">Owner: {section.owner}</p>
                  </div>
                  <span className={`h-fit text-[10px] font-bold px-2 py-1 rounded-full border ${section.status === 'Published' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>{section.status}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

const ContentCard = ({ icon: Icon, title, value, copy }) => (
  <article className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
    <div className="flex items-start justify-between mb-4">
      <Icon className="w-6 h-6 text-[#b3000c]" />
      <span className="text-xs font-bold text-slate-400 uppercase">{value}</span>
    </div>
    <h2 className="text-lg font-bold text-slate-900 mb-2">{title}</h2>
    <p className="text-sm text-slate-500 leading-6">{copy}</p>
  </article>
);

export default WebsiteManagement;

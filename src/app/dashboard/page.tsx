export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-500">
          Visão geral do SaaS. Conteúdo será adicionado nos próximos passos.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-sm font-medium text-slate-700">Conversas</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">--</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-sm font-medium text-slate-700">Leads</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">--</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-sm font-medium text-slate-700">Automações</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">--</p>
        </div>
      </div>
    </div>
  );
}

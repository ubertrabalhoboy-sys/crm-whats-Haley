export default function KanbanPage() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h1 className="text-xl font-semibold text-slate-900">Kanban</h1>
        <p className="mt-2 text-sm text-slate-500">
          Quadro de pipeline em preparação. Estrutura inicial pronta.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-sm font-medium text-slate-700">Novo</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-sm font-medium text-slate-700">Em andamento</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-sm font-medium text-slate-700">Concluído</p>
        </div>
      </div>
    </div>
  );
}

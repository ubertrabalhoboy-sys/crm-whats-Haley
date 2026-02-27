"use client";

import { useState, useRef } from "react";
import useSWR from "swr";
import { Gift, Plus, Search, Tag, Trash2, Edit, Image as ImageIcon, UploadCloud, X, Loader2 } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ProdutoPromo = {
    id: string;
    nome: string;
    preco_original: number;
    preco_promo: number;
    estoque: number;
    imagem_url?: string;
    category?: string;
    is_extra?: boolean;
    description?: string;
};

const fetcher = async (url: string) => {
    const res = await fetch(url);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Erro de Fetch");
    return json;
};

export default function PromocoesPage() {
    const [isAdding, setIsAdding] = useState(false);
    const [formData, setFormData] = useState({
        id: null as string | null,
        nome: "",
        description: "",
        preco_original: "",
        preco_promo: "",
        estoque: "0",
        imagem_url: "",
        category: "principal",
        is_extra: false,
    });

    // File Upload States
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const supabase = createSupabaseBrowserClient();

    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const objectUrl = URL.createObjectURL(file);
            setPreviewUrl(objectUrl);
        }
    };

    const handleRemoveImage = () => {
        setImageFile(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const { data, error, mutate, isValidating } = useSWR<{ ok: boolean; products: ProdutoPromo[] }>(
        `/api/promocoes`,
        fetcher,
        { refreshInterval: 5000 }
    );

    const products = data?.products || [];
    const isLoading = !data && !error;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);
        setIsUploading(true);

        try {
            let finalImageUrl = formData.imagem_url;

            // Faz upload da imagem fisicamente
            if (imageFile) {
                const fileExt = imageFile.name.split('.').pop();
                const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('produtos')
                    .upload(fileName, imageFile, {
                        cacheControl: '3600',
                        upsert: false
                    });

                if (uploadError) {
                    throw new Error(`Erro ao fazer upload da imagem: ${uploadError.message}`);
                }

                // Busca a url pública via Supabase
                const { data: publicUrlData } = supabase.storage
                    .from('produtos')
                    .getPublicUrl(fileName);

                finalImageUrl = publicUrlData.publicUrl;
            }

            const res = await fetch("/api/promocoes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: formData.id,
                    nome: formData.nome,
                    description: formData.description || null,
                    preco_original: Number(formData.preco_original),
                    preco_promo: Number(formData.preco_promo),
                    estoque: Number(formData.estoque),
                    imagem_url: finalImageUrl,
                    category: formData.category,
                    is_extra: formData.is_extra,
                }),
            });

            const json = await res.json();
            if (!json.ok) throw new Error(json.error || "Falha ao salvar produto");

            mutate(); // Traz a lista nova
            setFormData({ id: null, nome: "", description: "", preco_original: "", preco_promo: "", estoque: "0", imagem_url: "", category: "principal", is_extra: false });
            handleRemoveImage();
            setIsAdding(false);
        } catch (err: any) {
            setErrorMsg(err.message);
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Tem certeza que deseja remover este prêmio/produto?")) return;
        try {
            const res = await fetch(`/api/promocoes?id=${id}`, { method: "DELETE" });
            if (res.ok) mutate();
        } catch (err) {
            console.error(err);
        }
    };

    const handleEdit = (product: ProdutoPromo) => {
        setFormData({
            id: product.id,
            nome: product.nome,
            description: (product as any).description || "",
            preco_original: product.preco_original.toString(),
            preco_promo: product.preco_promo.toString(),
            estoque: product.estoque.toString(),
            imagem_url: product.imagem_url || "",
            category: (product as any).category || "principal",
            is_extra: (product as any).is_extra || false
        });
        setPreviewUrl(product.imagem_url || null);
        setImageFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setIsAdding(true);
        setErrorMsg(null);
    };

    const handleToggleAdding = () => {
        if (isAdding) {
            setIsAdding(false);
            setFormData({ id: null, nome: "", description: "", preco_original: "", preco_promo: "", estoque: "0", imagem_url: "", category: "principal", is_extra: false });
            handleRemoveImage();
            setErrorMsg(null);
        } else {
            setIsAdding(true);
        }
    };

    return (
        <div className="relative h-full flex flex-col overflow-hidden w-full">
            {/* Pattern de fundo */}
            <div className="pointer-events-none absolute inset-0 opacity-[0.04] [filter:hue-rotate(160deg)_saturate(0.5)] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat" />

            {/* Header */}
            <div className="mb-4 flex items-center justify-between rounded-[2.5rem] border border-white/70 bg-white/60 px-8 py-6 shadow-xl backdrop-blur-xl relative z-10 shrink-0 mx-2">
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-purple-500/20">
                        <Gift size={24} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-[950] uppercase tracking-tighter text-indigo-900 leading-none">
                            Promoções
                        </h1>
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.3em] text-purple-600">
                            Prêmios FiQon Roleta e Vitrine
                        </p>
                    </div>
                </div>

                <button
                    onClick={handleToggleAdding}
                    className="rounded-2xl bg-indigo-600 px-6 py-4 text-[12px] font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-500/30 transition-all duration-300 active:scale-95 hover:bg-indigo-700 hover:shadow-indigo-500/50 flex items-center gap-2"
                >
                    {isAdding ? "Cancelar Cadastro" : <><Plus size={16} /> Novo Produto</>}
                </button>
            </div>

            <div className="relative flex-1 min-h-0 mx-2 flex gap-6">
                {/* Painel Formulário */}
                {isAdding && (
                    <div className="w-full max-w-[450px] shrink-0 h-full flex flex-col rounded-[2.5rem] border border-white/70 bg-white/50 backdrop-blur-xl shadow-lg p-8 overflow-y-auto custom-scroll">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="h-8 w-8 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
                                <Tag size={16} />
                            </div>
                            <h2 className="text-lg font-bold text-indigo-900">{formData.id ? "Editar Prêmio" : "Cadastrar Prêmio"}</h2>
                        </div>

                        {errorMsg && (
                            <div className="mb-6 rounded-xl bg-red-50 p-4 border border-red-100 text-red-600 text-sm font-semibold">
                                {errorMsg}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                            <div className="flex flex-col gap-2">
                                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                                    Nome do Produto/Prêmio
                                </label>
                                <input
                                    required
                                    type="text"
                                    value={formData.nome}
                                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                                    className="rounded-2xl border border-white bg-white/80 px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-all focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                                    placeholder="Ex: Hambúrguer Duplo"
                                />
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                                    Descrição do Produto
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="rounded-2xl border border-white bg-white/80 px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-all focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100 resize-none h-20"
                                    placeholder="Descreva o produto para a IA e para o carrossel do WhatsApp..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                                        Preço Original
                                    </label>
                                    <input
                                        required
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="0.00"
                                        value={formData.preco_original}
                                        onChange={(e) => setFormData({ ...formData, preco_original: e.target.value })}
                                        className="rounded-2xl border border-white bg-white/80 px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-all focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 truncate">
                                        Preço Promo
                                    </label>
                                    <input
                                        required
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="0.00"
                                        value={formData.preco_promo}
                                        onChange={(e) => setFormData({ ...formData, preco_promo: e.target.value })}
                                        className="rounded-2xl border border-indigo-200 bg-indigo-50/80 px-4 py-3.5 text-sm font-semibold text-indigo-900 shadow-sm outline-none transition-all focus:border-indigo-400 focus:bg-indigo-50 focus:ring-4 focus:ring-indigo-100"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500 truncate">
                                    Quantidade em Estoque Limitado (Qtd)
                                </label>
                                <input
                                    required
                                    type="number"
                                    min="0"
                                    value={formData.estoque}
                                    onChange={(e) => setFormData({ ...formData, estoque: e.target.value })}
                                    className="rounded-2xl border border-white bg-white/80 px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-all focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                                />
                            </div>

                            {/* Category & Is Extra */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                                        Categoria
                                    </label>
                                    <select
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className="rounded-2xl border border-white bg-white/80 px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-all focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                                    >
                                        <option value="principal">Principal</option>
                                        <option value="bebida">Bebida</option>
                                        <option value="adicional">Adicional</option>
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2 justify-end">
                                    <label className="flex items-center gap-2 cursor-pointer px-4 py-3.5 rounded-2xl border border-white bg-white/80 hover:bg-indigo-50 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={formData.is_extra}
                                            onChange={(e) => setFormData({ ...formData, is_extra: e.target.checked })}
                                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-xs font-bold text-slate-700">É Complemento</span>
                                    </label>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                                    Foto do Prêmio/Produto
                                </label>

                                {previewUrl ? (
                                    <div className="relative w-full h-40 rounded-2xl border border-indigo-100 overflow-hidden shadow-sm group">
                                        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-indigo-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                            <button
                                                type="button"
                                                onClick={handleRemoveImage}
                                                className="bg-white text-rose-500 p-2 rounded-xl shadow-lg hover:scale-110 hover:bg-rose-50 transition-all font-bold text-xs flex items-center gap-2"
                                            >
                                                <X size={16} /> Remover Foto
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full h-32 rounded-2xl border-2 border-dashed border-indigo-200 bg-white/50 hover:bg-indigo-50/50 hover:border-indigo-400 transition-all flex flex-col items-center justify-center cursor-pointer group shadow-sm text-center px-4"
                                    >
                                        <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-500 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                                            <UploadCloud size={20} />
                                        </div>
                                        <span className="text-xs font-bold text-indigo-900">Clique para enviar uma Imagem</span>
                                        <span className="text-[10px] text-slate-400 font-medium mt-1">PNG, JPG ou WEBP (Max. 2MB)</span>
                                    </div>
                                )}

                                <input
                                    type="file"
                                    accept="image/*"
                                    ref={fileInputRef}
                                    onChange={handleImageSelect}
                                    className="hidden"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isUploading}
                                className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-500 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-500/30 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/40 disabled:opacity-70 disabled:hover:translate-y-0"
                            >
                                {isUploading ? (
                                    <><Loader2 size={18} className="animate-spin" /> Salvando...</>
                                ) : (
                                    formData.id ? "Atualizar Prêmio" : "Salvar Produto"
                                )}
                            </button>
                        </form>
                    </div>
                )}

                {/* Painel Listagem (Grid) */}
                <div className={`flex flex-col flex-1 h-full rounded-[2.5rem] border border-white/70 bg-white/40 backdrop-blur-xl shadow-lg p-8 overflow-y-auto custom-scroll`}>
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-xl font-black text-indigo-900 shrink-0">Produtos Cadastrados</h2>
                        {(isLoading || isValidating) && (
                            <div className="flex gap-2">
                                <div className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                                <div className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                                <div className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="rounded-xl bg-red-50 p-6 border border-red-100 text-center">
                            <span className="text-red-500 font-bold block">{error.message || "Erro ao listar"}</span>
                        </div>
                    )}

                    {products.length === 0 && !isLoading && !error && (
                        <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-indigo-200/50 rounded-3xl p-10 mt-4 text-center">
                            <div className="h-20 w-20 bg-white/60 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-indigo-500/5">
                                <Gift size={32} className="text-indigo-400" />
                            </div>
                            <h3 className="text-lg font-bold text-slate-700 mb-2">Nenhuma Promoção Pronta</h3>
                            <p className="text-sm text-slate-500 max-w-sm mb-6">
                                Comece a cadastrar prêmios para abastecer a Roleta da FiQon ou enviar o Catálogo Promocional para os seus clientes via CRM.
                            </p>
                            <button onClick={() => setIsAdding(true)} className="px-6 py-3 rounded-2xl bg-indigo-50 text-indigo-600 font-bold border border-indigo-100 hover:bg-indigo-100 transition-colors">
                                Cadastrar Primeiro Prêmio
                            </button>
                        </div>
                    )}

                    {/* Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {products.map((p) => (
                            <div key={p.id} className="group relative flex flex-col rounded-3xl bg-white border border-slate-100 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                    <button onClick={() => handleEdit(p)} className="h-8 w-8 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center hover:bg-amber-500 hover:text-white transition-colors">
                                        <Edit size={14} />
                                    </button>
                                    <button onClick={() => handleDelete(p.id)} className="h-8 w-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors">
                                        <Trash2 size={14} />
                                    </button>
                                </div>

                                {p.imagem_url ? (
                                    <div className="h-14 w-14 rounded-2xl mb-4 shadow-sm border border-slate-200 overflow-hidden shrink-0">
                                        <img src={p.imagem_url} alt={p.nome} className="h-full w-full object-cover" />
                                    </div>
                                ) : (
                                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-50 flex items-center justify-center mb-4 text-indigo-500 shadow-inner shrink-0">
                                        <ImageIcon size={24} />
                                    </div>
                                )}

                                {/* Badges */}
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {p.category && (
                                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-500 border border-slate-200">
                                            {p.category}
                                        </span>
                                    )}
                                    {p.is_extra && (
                                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-amber-100 text-amber-600 border border-amber-200">
                                            Complemento
                                        </span>
                                    )}
                                </div>

                                <h3 className="text-base font-black text-slate-800 mb-4 line-clamp-2">{p.nome}</h3>

                                <div className="flex flex-col gap-1 mb-4 mt-auto">
                                    <span className="text-xs text-slate-400 line-through font-semibold">De: R$ {p.preco_original.toFixed(2)}</span>
                                    <span className="text-lg font-black text-indigo-600">Por: R$ {p.preco_promo.toFixed(2)}</span>
                                </div>

                                <div className="flex items-center justify-between border-t border-slate-50 pt-4 mt-2">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Estoque</span>
                                    <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${p.estoque > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                                        {p.estoque > 0 ? `${p.estoque} UND` : 'ESGOTADO'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Estilos injetados */}
            <style>{`
        .custom-scroll::-webkit-scrollbar { width: 6px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #6366f1; border-radius: 10px; opacity: 0.5; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
      `}</style>
        </div>
    );
}

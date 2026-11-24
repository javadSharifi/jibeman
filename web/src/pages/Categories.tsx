import React, { useState, useEffect } from 'react';
import { Plus, X, Tag } from 'lucide-react';
import { db, type Category } from '../core/db';
import { CategoryIcon, HeaderBar, CAT_COLORS } from '../components/UI';

export function Categories({ onBack }: { onBack: () => void }) {
  const [kind, setKind] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [categories, setCategories] = useState<Category[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [colorIdx, setColorIdx] = useState(0);

  const loadCategories = async () => {
    const list = await db.categories.where('kind').equals(kind).sortBy('sortOrder');
    setCategories(list);
  };

  useEffect(() => {
    loadCategories();
  }, [kind]);

  const handleAddCategory = async () => {
    if (!name.trim()) return;

    await db.categories.add({
      name: name.trim(),
      kind,
      icon: 'Tag',
      color: colorIdx,
      sortOrder: categories.length,
    });

    setIsAddOpen(false);
    setName('');
    loadCategories();
  };

  return (
    <div className="flex flex-col pb-28 pt-2 px-4 max-w-md mx-auto">
      <HeaderBar
        title="مدیریت دسته‌بندی‌ها"
        onBack={onBack}
        action={
          <button
            onClick={() => setIsAddOpen(true)}
            className="w-10 h-10 rounded-2xl bg-lime text-onLime flex items-center justify-center shadow-fab"
          >
            <Plus size={20} strokeWidth={2.8} />
          </button>
        }
      />

      <div className="flex bg-surface rounded-2xl p-1 gap-1 my-3">
        <button
          onClick={() => setKind('EXPENSE')}
          className={`flex-1 h-10 rounded-xl text-xs font-bold transition-all ${
            kind === 'EXPENSE' ? 'bg-lime text-onLime shadow' : 'text-t2'
          }`}
        >
          دسته‌های هزینه
        </button>
        <button
          onClick={() => setKind('INCOME')}
          className={`flex-1 h-10 rounded-xl text-xs font-bold transition-all ${
            kind === 'INCOME' ? 'bg-lime text-onLime shadow' : 'text-t2'
          }`}
        >
          دسته‌های درآمد
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mt-2">
        {categories.map(cat => (
          <div key={cat.id} className="p-3 rounded-2xl bg-surface border border-line flex items-center gap-2.5">
            <CategoryIcon icon={cat.icon} colorIdx={cat.color} size={18} />
            <span className="text-xs font-bold text-white truncate">{cat.name}</span>
          </div>
        ))}
      </div>

      {/* Add Category Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 className="text-sm font-bold text-white">افزودن دسته جدید</h2>
              <button onClick={() => setIsAddOpen(false)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted">
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">نام دسته</label>
              <input
                type="text"
                placeholder="مثلاً: اینترنت، هدیه..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
              />
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-2">رنگ شناسه</label>
              <div className="flex gap-2">
                {CAT_COLORS.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setColorIdx(i)}
                    className={`w-7 h-7 rounded-full transition-transform ${
                      colorIdx === i ? 'ring-2 ring-white scale-110' : 'opacity-70'
                    }`}
                    style={{ backgroundColor: c.text }}
                  />
                ))}
              </div>
            </div>

            <button
              onClick={handleAddCategory}
              className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center shadow-fab"
            >
              ذخیره دسته
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

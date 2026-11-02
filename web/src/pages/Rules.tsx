import React, { useState, useEffect } from 'react';
import { Plus, X, Wand2, Trash2 } from 'lucide-react';
import { db, type Rule, type Category } from '../core/db';
import { HeaderBar, CategoryIcon } from '../components/UI';

interface RuleWithCategory extends Rule {
  categoryName?: string;
  categoryIcon?: string;
  categoryColor?: number;
}

export function Rules({ onBack }: { onBack: () => void }) {
  const [rules, setRules] = useState<RuleWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form states
  const [contains, setContains] = useState('');
  const [selectedCatId, setSelectedCatId] = useState<number | undefined>();

  const loadRules = async () => {
    const [allRules, allCats] = await Promise.all([
      db.rules.toArray(),
      db.categories.toArray(),
    ]);
    setCategories(allCats);
    if (allCats.length > 0 && !selectedCatId) setSelectedCatId(allCats[0].id);

    const catMap = new Map(allCats.map(c => [c.id!, c]));
    setRules(allRules.map(r => {
      const c = r.categoryId ? catMap.get(r.categoryId) : undefined;
      return {
        ...r,
        categoryName: c?.name,
        categoryIcon: c?.icon,
        categoryColor: c?.color,
      };
    }));
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleSave = async () => {
    if (!contains.trim() || !selectedCatId) return;

    await db.rules.add({
      contains: contains.trim(),
      categoryId: selectedCatId,
      enabled: true,
    });

    setIsAddOpen(false);
    setContains('');
    loadRules();
  };

  const handleToggle = async (r: Rule) => {
    await db.rules.update(r.id!, { enabled: !r.enabled });
    loadRules();
  };

  const handleDelete = async (id: number) => {
    await db.rules.delete(id);
    loadRules();
  };

  return (
    <div className="flex flex-col pb-28 pt-2 px-4 max-w-md mx-auto">
      <HeaderBar
        title="قوانین هوشمند دسته‌بندی"
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

      <div className="mt-3 p-3.5 rounded-2xl bg-surface border border-line text-xs text-muted leading-relaxed">
        با ثبت قانون، هر زمان تراکنش جدیدی (یا پیامک) حاوی کلمه مورد نظر باشد، دسته‌بندی آن به صورت خودکار تعیین خواهد شد.
      </div>

      <div className="space-y-3 mt-4">
        {rules.map(r => (
          <div key={r.id} className="p-4 rounded-[22px] bg-surface border border-line flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CategoryIcon icon={r.categoryIcon} colorIdx={r.categoryColor ?? 0} size={18} />
              <div>
                <div className="text-xs text-white">
                  اگر متن شامل <span className="font-bold text-lime font-mono">"{r.contains}"</span> بود:
                </div>
                <div className="text-[11px] text-sky font-semibold mt-0.5">
                  دسته‌بندی ← {r.categoryName || 'تعیین نشده'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleToggle(r)}
                className={`w-9 h-5 rounded-full transition-colors relative ${
                  r.enabled ? 'bg-lime' : 'bg-surface2'
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded-full bg-onLime absolute top-0.75 transition-all ${
                  r.enabled ? 'left-4.5' : 'left-1'
                }`} />
              </button>

              <button
                onClick={() => handleDelete(r.id!)}
                className="w-8 h-8 rounded-full hover:bg-bad/20 text-muted hover:text-bad flex items-center justify-center transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}

        {rules.length === 0 && (
          <div className="py-20 text-center text-muted text-xs">
            قانونی ثبت نشده است. مثلاً می‌توانید بنویسید: اگر متن شامل «اسنپ» بود ← دسته‌بندی «حمل‌ونقل».
          </div>
        )}
      </div>

      {/* Add Rule Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 className="text-sm font-bold text-white">تعریف قانون جدید</h2>
              <button onClick={() => setIsAddOpen(false)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted">
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">کلمه یا عبارت جستجو در متن</label>
              <input
                type="text"
                placeholder="مثلاً: اسنپ، دیجی‌کالا، هایپراستار..."
                value={contains}
                onChange={(e) => setContains(e.target.value)}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
              />
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">دسته‌بندی خودکار شود به:</label>
              <select
                value={selectedCatId || ''}
                onChange={(e) => setSelectedCatId(Number(e.target.value))}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.kind === 'EXPENSE' ? 'هزینه' : 'درآمد'})</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSave}
              className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center shadow-fab"
            >
              ایجاد قانون
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Plus, X, User, Phone, CreditCard, Trash2 } from 'lucide-react';
import { db, type Person } from '../core/db';
import { HeaderBar } from '../components/UI';
import { Money } from '../core/money';
import { BankKit } from '../core/bankKit';
import { protectRow, revealRows } from '../core/db/protectedRows';
import { isLockEnabled } from '../core/security';

interface PersonWithBalance extends Person {
  owedToMe: number;
  iOwe: number;
}

export function People({ onBack, hidden }: { onBack: () => void; hidden: boolean }) {
  const [people, setPeople] = useState<PersonWithBalance[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cardNo, setCardNo] = useState('');
  const [note, setNote] = useState('');

  const loadPeople = async () => {
    const [allPersons, allDebts, allPayments] = await Promise.all([
      db.persons.toArray(),
      db.debts.toArray(),
      db.debtPayments.toArray(),
    ]);

    const withBalances: PersonWithBalance[] = (await revealRows('persons', allPersons)).map(p => {
      let owedToMe = 0;
      let iOwe = 0;
      const pDebts = allDebts.filter(d => d.personId === p.id || d.person.trim() === p.name.trim());
      for (const d of pDebts) {
        const pmts = allPayments.filter(x => x.debtId === d.id);
        const rem = Math.max(0, d.amount - pmts.reduce((a, b) => a + b.amount, 0));
        if (d.direction === 'OWED_TO_ME') owedToMe += rem;
        else iOwe += rem;
      }
      return {
        ...p,
        owedToMe,
        iOwe,
      };
    });

    setPeople(withBalances);
  };

  useEffect(() => {
    loadPeople();
  }, []);

  const handleSave = async () => {
    if (!name.trim()) return;

    await db.persons.add(await protectRow('persons', {
      name: name.trim(),
      phone: phone.trim() || undefined,
      cardNo: cardNo ? BankKit.cleanDigits(cardNo) : undefined,
      note: note.trim() || undefined,
      createdAt: Date.now(),
    }));

    setIsAddOpen(false);
    setName('');
    setPhone('');
    setCardNo('');
    setNote('');
    loadPeople();
  };

  const handleDelete = async (id: number) => {
    if (confirm('آیا از حذف این شخص اطمینان دارید؟')) {
      await db.persons.delete(id);
      loadPeople();
    }
  };

  return (
    <div className="flex flex-col pb-28 pt-2 px-4 max-w-md mx-auto">
      <HeaderBar
        title="دفترچه اشخاص و مخاطبین"
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

      <div className="space-y-3 mt-4">
        {people.map(p => {
          const net = p.owedToMe - p.iOwe;
          return (
            <div key={p.id} className="p-4 rounded-[22px] bg-surface border border-line space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-500/15 text-purple-300 font-extrabold flex items-center justify-center text-sm">
                    {p.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{p.name}</h3>
                    {p.phone && (
                      <div className="text-[11px] text-muted dir-ltr text-right flex items-center gap-1">
                        <Phone size={11} />
                        <span>{p.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    {net > 0 && (
                      <span className="text-xs font-bold text-ok block dir-ltr">
                        {hidden ? '•••' : Money.toman(net, true)} تومان طلبکارید
                      </span>
                    )}
                    {net < 0 && (
                      <span className="text-xs font-bold text-warn block dir-ltr">
                        {hidden ? '•••' : Money.toman(Math.abs(net))} تومان بدهکارید
                      </span>
                    )}
                    {net === 0 && (
                      <span className="text-[11px] text-muted block">بی‌حساب</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleDelete(p.id!)}
                    className="w-8 h-8 rounded-full hover:bg-bad/20 text-muted hover:text-bad flex items-center justify-center transition-colors mr-1"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {p.cardNo && (
                <div className="pt-2 border-t border-line flex items-center justify-between text-xs text-muted">
                  <div className="flex items-center gap-1.5 font-mono dir-ltr">
                    <CreditCard size={13} />
                    <span>•••• •••• •••• {p.cardNo.slice(-4)}</span>
                  </div>
                  <button
                    onClick={() => {
                      if (!isLockEnabled()) {
                        alert('برای دسترسی به شماره کارت، ابتدا رمز برنامه را در تنظیمات امنیت فعال کنید.');
                        return;
                      }
                      navigator.clipboard.writeText(p.cardNo!).catch(() => {});
                    }}
                    className="text-[10px] text-sky font-bold hover:underline"
                  >
                    کپی کارت
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {people.length === 0 && (
          <div className="py-20 text-center text-muted text-xs">
            هیچ شخصی در دفترچه ثبت نشده است. با دکمه + افراد را اضافه کنید.
          </div>
        )}
      </div>

      {/* Add Person Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <h2 className="text-sm font-bold text-white">افزودن شخص جدید</h2>
              <button onClick={() => setIsAddOpen(false)} className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted">
                <X size={16} />
              </button>
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">نام و نام خانوادگی</label>
              <input
                type="text"
                placeholder="مثلاً: محمد صادقی"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
              />
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">شماره تماس (اختیاری)</label>
              <input
                type="tel"
                placeholder="0912..."
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(Money.ascii(e.target.value))}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] text-muted block mb-1">شماره کارت بانکی (جهت واریز/تسویه)</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="6037 ..."
                dir="ltr"
                value={cardNo ? BankKit.formatCardNumber(cardNo) : ''}
                onChange={(e) => setCardNo(BankKit.cleanDigits(e.target.value).slice(0, 16))}
                className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky font-mono"
              />
            </div>

            <button
              onClick={handleSave}
              className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center shadow-fab"
            >
              ذخیره در دفترچه
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

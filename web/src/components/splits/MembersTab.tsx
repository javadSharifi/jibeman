import React, { useEffect, useState } from 'react';
import { Archive, RotateCcw, UserCheck, UserPlus } from 'lucide-react';
import { db, type Person } from '../../core/db';
import { revealRows } from '../../core/db/protectedRows';
import { Money } from '../../core/money';
import type { GroupFinancialSummary, SplitMemberDomain } from '../../core/splits';
import {
  addMemberToGroup,
  archiveMember,
  restoreMember,
} from '../../core/splits/splitRepo';

interface MembersTabProps {
  groupId: number;
  isClosed: boolean;
  hidden: boolean;
  members: SplitMemberDomain[];
  summary: GroupFinancialSummary;
  onUpdated: () => void;
}

export function MembersTab({
  groupId,
  isClosed,
  hidden,
  members,
  summary,
  onUpdated,
}: MembersTabProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [contacts, setContacts] = useState<Person[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!showAdd) return;
    (async () => {
      const raw = await db.persons.toArray();
      const revealed = await revealRows('persons', raw);
      setContacts(revealed.sort((a, b) => a.name.localeCompare(b.name, 'fa')));
    })();
  }, [showAdd]);

  const activePersonIds = new Set(
    members
      .filter((m) => m.status === 'ACTIVE' && m.personId != null)
      .map((m) => m.personId!),
  );

  const availableContacts = contacts.filter(
    (c): c is Person & { id: number } => c.id != null && !activePersonIds.has(c.id),
  );

  const handleAddContact = async (c: Person & { id: number }) => {
    setError(null);
    setAdding(true);
    try {
      await addMemberToGroup(groupId, { personId: c.id, displayName: c.name });
      onUpdated();
    } catch (err: any) {
      setError(err?.message || 'خطا در افزودن عضو');
    } finally {
      setAdding(false);
    }
  };

  const handleAddName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    setAdding(true);
    try {
      await addMemberToGroup(groupId, { displayName: newName.trim() });
      setNewName('');
      onUpdated();
    } catch (err: any) {
      setError(err?.message || 'خطا در افزودن عضو');
    } finally {
      setAdding(false);
    }
  };

  const handleArchive = async (memberId: number) => {
    setError(null);
    setBusyId(memberId);
    try {
      await archiveMember(groupId, memberId);
      onUpdated();
    } catch (err: any) {
      setError(err?.message || 'خطا در بایگانی عضو');
    } finally {
      setBusyId(null);
    }
  };

  const handleRestore = async (memberId: number) => {
    setError(null);
    setBusyId(memberId);
    try {
      await restoreMember(groupId, memberId);
      onUpdated();
    } catch (err: any) {
      setError(err?.message || 'خطا در بازیابی عضو');
    } finally {
      setBusyId(null);
    }
  };

  const fmt = (rial: number) => (hidden ? Money.HIDDEN : Money.toman(rial));

  const sortedMembers = [...members].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'ACTIVE' ? -1 : 1;
    if (a.role !== b.role) return a.role === 'SELF' ? -1 : 1;
    return a.id - b.id;
  });

  return (
    <div className="space-y-3">
      {!isClosed && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-t2">
            اعضای گروه ({Money.fa(String(members.filter((m) => m.status === 'ACTIVE').length))} فعال)
          </span>
          <button
            type="button"
            onClick={() => {
              setShowAdd((v) => !v);
              setError(null);
            }}
            className="h-8 px-3 rounded-xl bg-sky/15 border border-sky/25 text-sky text-[11px] font-bold flex items-center gap-1"
          >
            <UserPlus size={13} />
            <span>{showAdd ? 'بستن' : 'افزودن عضو'}</span>
          </button>
        </div>
      )}

      {showAdd && !isClosed && (
        <div className="p-3.5 rounded-[20px] bg-surface border border-line space-y-2.5">
          {availableContacts.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-muted">انتخاب از مخاطبین جیب:</div>
              <div className="flex flex-wrap gap-1.5">
                {availableContacts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    disabled={adding}
                    onClick={() => handleAddContact(c)}
                    className="h-8 px-2.5 rounded-full bg-surface2 border border-line hover:border-sky text-xs text-white flex items-center gap-1"
                  >
                    <UserCheck size={12} className="text-sky" />
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleAddName} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="افزودن عضو جدید با نام..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={60}
              className="flex-1 h-10 rounded-xl bg-surface2 border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
            />
            <button
              type="submit"
              disabled={adding || !newName.trim()}
              className="h-10 px-3.5 rounded-xl bg-lime text-onLime font-bold text-xs disabled:opacity-45"
            >
              افزودن
            </button>
          </form>
        </div>
      )}

      {error && (
        <div className="p-2.5 rounded-xl bg-bad/15 border border-bad/30 text-bad text-[11px]">
          {error}
        </div>
      )}

      <div className="space-y-2.5">
        {sortedMembers.map((m) => {
          const bal = summary.balanceByMemberId.get(m.id);
          const net = bal?.netBalance ?? 0;
          const totalPaid = bal?.totalPaid ?? 0;
          const totalShare = bal?.totalShare ?? 0;
          const isArchived = m.status === 'ARCHIVED';
          const canArchive = !isClosed && !isArchived && m.role !== 'SELF' && net === 0;

          return (
            <div
              key={m.id}
              className={`p-3.5 rounded-[20px] border space-y-2.5 ${
                isArchived
                  ? 'bg-surface/60 border-line/60 opacity-75'
                  : 'bg-surface border-line'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl font-extrabold text-xs flex items-center justify-center shrink-0 ${
                      m.role === 'SELF'
                        ? 'bg-lime/20 text-lime'
                        : 'bg-sky/15 text-sky'
                    }`}
                  >
                    {m.displayName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white truncate">
                        {m.displayName}
                      </span>
                      {m.role === 'SELF' && (
                        <span className="px-1.5 py-0.5 rounded-full bg-lime/15 text-lime text-[9px] font-bold">
                          شما
                        </span>
                      )}
                      {isArchived && (
                        <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-muted text-[9px] font-bold">
                          بایگانی
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      net > 0
                        ? 'bg-ok/15 text-ok'
                        : net < 0
                          ? 'bg-warn/15 text-warn'
                          : 'bg-white/5 text-muted'
                    }`}
                  >
                    {net > 0 ? 'طلبکار' : net < 0 ? 'بدهکار' : 'تسویه'}
                  </span>

                  {!isClosed && m.role !== 'SELF' && !isArchived && (
                    <button
                      type="button"
                      disabled={busyId === m.id}
                      onClick={() => {
                        if (!canArchive) {
                          setError(
                            `«${m.displayName}» مانده تسویه‌نشده دارد؛ ابتدا بدهی/طلبش را تسویه کنید.`,
                          );
                          return;
                        }
                        handleArchive(m.id);
                      }}
                      title={canArchive ? 'بایگانی عضو' : 'ابتدا مانده باید صفر شود'}
                      aria-label="بایگانی عضو"
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                        canArchive
                          ? 'bg-white/5 hover:bg-white/10 text-t2'
                          : 'bg-white/5 text-muted/40'
                      }`}
                    >
                      <Archive size={13} />
                    </button>
                  )}

                  {!isClosed && isArchived && (
                    <button
                      type="button"
                      disabled={busyId === m.id}
                      onClick={() => handleRestore(m.id)}
                      title="فعال‌سازی مجدد"
                      aria-label="فعال‌سازی مجدد"
                      className="w-7 h-7 rounded-lg bg-sky/15 text-sky flex items-center justify-center"
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-line/60 text-center">
                <div>
                  <div className="text-[10px] text-muted">پرداختی</div>
                  <div className="text-xs font-bold text-white dir-ltr mt-0.5">
                    {fmt(totalPaid)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted">سهم کل</div>
                  <div className="text-xs font-bold text-white dir-ltr mt-0.5">
                    {fmt(totalShare)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted">مانده خالص</div>
                  <div
                    className={`text-xs font-extrabold dir-ltr mt-0.5 ${
                      net > 0 ? 'text-ok' : net < 0 ? 'text-warn' : 'text-muted'
                    }`}
                  >
                    {net === 0 ? '۰' : fmt(net)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

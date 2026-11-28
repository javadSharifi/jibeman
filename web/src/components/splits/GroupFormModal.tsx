import React, { useEffect, useState } from 'react';
import { Check, Plus, UserCheck, UserPlus, X } from 'lucide-react';
import { db, type Person } from '../../core/db';
import { revealRows } from '../../core/db/protectedRows';
import { createGroup, updateGroup } from '../../core/splits/splitRepo';
import type { SplitGroupDomain } from '../../core/splits';
import { JalaliDatePicker } from './JalaliDatePicker';

interface GroupFormModalProps {
  isOpen: boolean;
  editingGroup?: SplitGroupDomain | null;
  onClose: () => void;
  onSaved: (groupId: number) => void;
}

export function GroupFormModal({
  isOpen,
  editingGroup = null,
  onClose,
  onSaved,
}: GroupFormModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState(() => Date.now());
  const [contacts, setContacts] = useState<Person[]>([]);
  const [selectedPersonIds, setSelectedPersonIds] = useState<number[]>([]);
  const [customNames, setCustomNames] = useState<string[]>([]);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (editingGroup) {
      setTitle(editingGroup.title);
      setDescription(editingGroup.description ?? '');
      setEventDate(editingGroup.eventDate);
      setSelectedPersonIds([]);
      setCustomNames([]);
      setNewName('');
    } else {
      setTitle('');
      setDescription('');
      setEventDate(Date.now());
      setSelectedPersonIds([]);
      setCustomNames([]);
      setNewName('');
      (async () => {
        const raw = await db.persons.toArray();
        const revealed = await revealRows('persons', raw);
        setContacts(revealed.sort((a, b) => a.name.localeCompare(b.name, 'fa')));
      })();
    }
  }, [isOpen, editingGroup]);

  if (!isOpen) return null;

  const toggleContact = (id: number) => {
    setSelectedPersonIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleAddCustomName = () => {
    const clean = newName.trim();
    if (!clean) return;
    if (clean === 'من') {
      setError('شما به‌صورت خودکار عضو گروه هستید.');
      return;
    }
    if (customNames.includes(clean)) {
      setNewName('');
      return;
    }
    const matchingContact = contacts.find((c) => c.name.trim() === clean && c.id != null);
    if (matchingContact?.id != null) {
      if (!selectedPersonIds.includes(matchingContact.id)) {
        setSelectedPersonIds((prev) => [...prev, matchingContact.id!]);
      }
    } else {
      setCustomNames((prev) => [...prev, clean]);
    }
    setNewName('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('نام گروه الزامی است.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingGroup) {
        await updateGroup(editingGroup.id, {
          title,
          description,
          eventDate,
        });
        onSaved(editingGroup.id);
      } else {
        const chosenContacts = contacts
          .filter((c): c is Person & { id: number } => c.id != null && selectedPersonIds.includes(c.id))
          .map((c) => ({ personId: c.id, displayName: c.name }));
        const newId = await createGroup({
          title,
          description,
          eventDate,
          contacts: chosenContacts,
          customMemberNames: customNames,
        });
        onSaved(newId);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'خطا در ذخیره گروه');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center safe-dialog bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-sheet rounded-[28px] border border-white/10 p-5 shadow-2xl space-y-3.5 animate-modal-in"
      >
        <div className="flex items-center justify-between border-b border-line pb-2.5">
          <h2 className="text-sm font-bold text-white">
            {editingGroup ? 'ویرایش مشخصات گروه' : 'ایجاد گروه دنگ جدید'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن"
            className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-muted"
          >
            <X size={16} />
          </button>
        </div>

        <div>
          <label className="text-[11px] text-muted block mb-1">نام گروه</label>
          <input
            type="text"
            placeholder="مثلاً: سفر شمال، خانه مشترک، شام جمعه"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
          />
        </div>

        <JalaliDatePicker
          label="تاریخ رویداد"
          valueMs={eventDate}
          onChangeMs={setEventDate}
        />

        <div>
          <label className="text-[11px] text-muted block mb-1">توضیحات (اختیاری)</label>
          <input
            type="text"
            placeholder="توضیح کوتاه درباره برنامه یا جمع..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={160}
            className="w-full h-11 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
          />
        </div>

        {!editingGroup && (
          <div className="space-y-2.5 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-t2">اعضای گروه</span>
              <span className="text-[10px] text-muted">شما خودکار عضو هستید</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <span className="h-8 px-3 rounded-full bg-lime/15 border border-lime/30 text-lime text-xs font-bold inline-flex items-center gap-1">
                <Check size={13} />
                من (خودم)
              </span>

              {contacts.map((c) => {
                if (c.id == null) return null;
                const active = selectedPersonIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleContact(c.id!)}
                    className={`h-8 px-3 rounded-full text-xs font-semibold border inline-flex items-center gap-1 transition-colors ${
                      active
                        ? 'bg-sky/20 border-sky text-sky'
                        : 'bg-surface border-line text-t2 hover:border-lineStrong'
                    }`}
                  >
                    <UserCheck size={12} />
                    <span>{c.name}</span>
                  </button>
                );
              })}

              {customNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setCustomNames((prev) => prev.filter((x) => x !== name))}
                  className="h-8 px-3 rounded-full bg-sky/20 border border-sky text-sky text-xs font-semibold inline-flex items-center gap-1"
                >
                  <span>{name}</span>
                  <X size={12} />
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="افزودن عضو با نام (بدون نیاز به مخاطب)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomName();
                    }
                  }}
                  maxLength={60}
                  className="w-full h-10 rounded-xl bg-surface border border-line text-white text-xs px-3 focus:outline-none focus:border-sky"
                />
              </div>
              <button
                type="button"
                onClick={handleAddCustomName}
                aria-label="افزودن نام"
                className="w-10 h-10 rounded-xl bg-surface2 border border-line text-white flex items-center justify-center shrink-0 hover:border-sky"
              >
                <UserPlus size={16} />
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="p-2.5 rounded-xl bg-bad/15 border border-bad/30 text-bad text-[11px]">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full h-11 rounded-xl bg-lime text-onLime font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-fab disabled:opacity-50"
        >
          <Plus size={16} />
          <span>{saving ? 'در حال ذخیره...' : editingGroup ? 'ذخیره تغییرات' : 'ایجاد گروه'}</span>
        </button>
      </form>
    </div>
  );
}

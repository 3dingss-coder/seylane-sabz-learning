import React, { useState } from 'react';
import { VisitorInfo } from '../types';
import { toPersianDigits } from '../utils/persian';

interface VisitorViewProps {
  visitor: VisitorInfo | null;
}

export const VisitorView: React.FC<VisitorViewProps> = ({ visitor }) => {
  if (!visitor) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center gap-2">
        <span className="material-symbols-outlined text-[40px] text-[#94a3b8]">support_agent</span>
        <p className="text-[13px] font-bold text-[#64748b]">
          هنوز ویزیتوری برای فروشگاه شما ثبت نشده است.
        </p>
      </div>
    );
  }
  const [messages, setMessages] = useState<
    { id: string; sender: 'user' | 'visitor'; text: string; time: string }[]
  >([
    {
      id: 'm1',
      sender: 'visitor',
      text: 'سلام و وقت بخیر دکتر ابراهیمی عزیز، در خدمت شما هستم. چنانچه سوالی در خصوص پکیج‌های جدید یا تخفیف‌های دوره جدید سیلانه سبز دارید بفرمایید.',
      time: '۱۰:۱۵',
    },
  ]);
  const [inputText, setInputText] = useState('');

  // Visit Scheduling State
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
  const [selectedVisitDate, setSelectedVisitDate] = useState('فردا (۱۵ مرداد)');
  const [selectedVisitTime, setSelectedVisitTime] = useState('۱۰:۰۰ تا ۱۲:۰۰ (صبح)');
  const [visitNote, setVisitNote] = useState('');
  const [scheduledVisitInfo, setScheduledVisitInfo] = useState<{
    date: string;
    timeSlot: string;
    notes?: string;
  } | null>(null);

  // Price List Modal State
  const [isPriceListModalOpen, setIsPriceListModalOpen] = useState(false);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);

  const visitDateOptions = [
    { id: 'today', label: 'امروز (۱۴ مرداد)', sub: 'امروز' },
    { id: 'tomorrow', label: 'فردا (۱۵ مرداد)', sub: 'روز کاری بعد' },
    { id: 'day_after', label: 'پس‌فردا (۱۶ مرداد)', sub: 'دو روز دیگر' },
    { id: 'saturday', label: 'شنبه آینده (۱۸ مرداد)', sub: 'آغاز هفته' },
  ];

  const visitTimeOptions = [
    { id: 'slot1', label: '۰۸:۰۰ تا ۱۰:۰۰', title: 'شیفت صبح اول' },
    { id: 'slot2', label: '۱۰:۰۰ تا ۱۲:۰۰', title: 'شیفت صبح دوم' },
    { id: 'slot3', label: '۱۲:۰۰ تا ۱۵:۰۰', title: 'شیفت ظهر' },
    { id: 'slot4', label: '۱۵:۰۰ تا ۱۸:۰۰', title: 'شیفت عصر' },
  ];

  const handleSend = (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    const newMsg = {
      id: Date.now().toString(),
      sender: 'user' as const,
      text: text,
      time: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, newMsg]);
    if (!textToSend) setInputText('');

    // Simulate visitor auto-reply after 1 sec
    setTimeout(() => {
      const reply = {
        id: (Date.now() + 1).toString(),
        sender: 'visitor' as const,
        text: 'پیام شما دریافت شد. درخواست شما به بخش پشتیبانی فروش سیلانه سبز ارجاع شد و تا لحظاتی دیگر پاسخ کامل خدمتتان ارسال می‌گردد.',
        time: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, reply]);
    }, 1000);
  };

  const handleConfirmVisitSchedule = () => {
    const schedule = {
      date: selectedVisitDate,
      timeSlot: selectedVisitTime,
      notes: visitNote,
    };
    setScheduledVisitInfo(schedule);
    setIsVisitModalOpen(false);

    // Auto add chat confirmation
    const userMsgText = `درخواست مراجعه حضوری ویزیتور ثبت شد.\n📅 تاریخ: ${selectedVisitDate}\n⏰ زمان: ${selectedVisitTime}${
      visitNote ? `\n📝 توضیحات: ${visitNote}` : ''
    }`;

    const newMsg = {
      id: Date.now().toString(),
      sender: 'user' as const,
      text: userMsgText,
      time: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, newMsg]);

    setTimeout(() => {
      const reply = {
        id: (Date.now() + 1).toString(),
        sender: 'visitor' as const,
        text: `نوبت شما برای ${selectedVisitDate} ساعت ${selectedVisitTime} در تقویم بازدید ویزیتور (${visitor.name}) ثبت شد. حتماً در زمان مقرر خدمتتان خواهیم رسید.`,
        time: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, reply]);
    }, 1200);
  };

  const handleCancelVisit = () => {
    setScheduledVisitInfo(null);
    handleSend('درخواست مراجعه حضوری قبلی را لغو کردم.');
  };

  const handleDownloadFile = (fileName: string) => {
    setDownloadToast(`فایل «${fileName}» با موفقیت دانلود شد.`);
    setTimeout(() => setDownloadToast(null), 3500);
  };

  return (
    <div
      className="pt-4 px-4 text-right relative"
      style={{ paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }}
    >
      {/* Download Toast Notification */}
      {downloadToast && (
        <div className="fixed top-4 left-4 right-4 z-50 bg-[#004532] text-white p-3.5 rounded-2xl shadow-xl border border-[#059669] flex items-center justify-between text-[12.5px] font-black animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#34d399] text-[20px]">
              download_done
            </span>
            <span>{downloadToast}</span>
          </div>
          <button onClick={() => setDownloadToast(null)} className="text-white/70 hover:text-white">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {/* Visitor Profile Card */}
      <div className="bg-gradient-to-l from-[#065f46] to-[#022c22] rounded-2xl p-4 text-white shadow-md mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img
              src={visitor.avatar}
              alt={visitor.name}
              className="w-14 h-14 rounded-full object-cover border-2 border-[#34d399]"
            />
            <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-[#34d399] border-2 border-[#022c22] rounded-full" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-[15px]">{visitor.name}</span>
              <span className="bg-[#34d399]/20 text-[#34d399] text-[10px] font-bold px-2 py-0.5 rounded-full">
                کد: {visitor.code}
              </span>
            </div>
            <span className="text-[11px] text-white/80 mt-0.5">{visitor.region}</span>
            <div className="flex items-center gap-1 text-[11px] text-[#34d399] mt-1 font-bold">
              <span className="material-symbols-outlined text-[14px]">star</span>
              <span>رضایتمندی مشتریان: {toPersianDigits(visitor.rating)} از ۵</span>
            </div>
          </div>
        </div>

        <a
          href={`tel:${visitor.phone}`}
          className="bg-[#34d399] text-[#022c22] p-2.5 rounded-full hover:bg-white active:scale-95 transition-all shadow-xs flex items-center justify-center"
          title="تماس تلفنی با ویزیتور"
        >
          <span className="material-symbols-outlined text-[22px]">call</span>
        </a>
      </div>

      {/* Quick Actions Buttons */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          onClick={() => setIsVisitModalOpen(true)}
          className="bg-white border border-[#bec9c2]/60 rounded-2xl p-3 flex items-center gap-2.5 hover:bg-[#f6fafe] active:scale-[0.98] transition-all text-right shadow-xs border-r-4 border-r-[#059669]"
        >
          <span className="material-symbols-outlined text-[#059669] text-[24px]">
            person_pin_circle
          </span>
          <div className="flex flex-col">
            <span className="text-[12.5px] font-black text-[#171c1f]">درخواست مراجعه حضوری</span>
            <span className="text-[10.5px] text-[#6f7973] font-extrabold">انتخاب روز و ساعت بازدید</span>
          </div>
        </button>

        <button
          onClick={() => setIsPriceListModalOpen(true)}
          className="bg-white border border-[#bec9c2]/60 rounded-2xl p-3 flex items-center gap-2.5 hover:bg-[#f6fafe] active:scale-[0.98] transition-all text-right shadow-xs border-r-4 border-r-[#0284c7]"
        >
          <span className="material-symbols-outlined text-[#0284c7] text-[24px]">
            request_quote
          </span>
          <div className="flex flex-col">
            <span className="text-[12.5px] font-black text-[#171c1f]">استعلام لیست قیمت</span>
            <span className="text-[10.5px] text-[#6f7973] font-extrabold">دریافت فایل اکسل / PDF</span>
          </div>
        </button>
      </div>

      {/* SCHEDULED VISIT ACTIVE DISPLAY BANNER */}
      {scheduledVisitInfo && (
        <div className="bg-[#ecfdf5] border-2 border-[#a7f3d0] p-3.5 rounded-2xl mb-4 shadow-xs text-right space-y-2 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[#004532]">
              <span className="material-symbols-outlined text-[22px] text-[#059669]">
                check_circle
              </span>
              <span className="text-[13px] font-black">نوبت مراجعه حضوری ویزیتور ثبت شد</span>
            </div>
            <span className="bg-[#059669] text-white text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-2xs">
              تأیید شده
            </span>
          </div>

          <div className="bg-white/80 backdrop-blur-xs p-2.5 rounded-xl border border-[#a7f3d0] flex items-center justify-between text-[12px] font-bold text-[#1e293b]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-[#059669]">
                calendar_month
              </span>
              <span>{scheduledVisitInfo.date}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#004532]">
              <span className="material-symbols-outlined text-[16px] text-[#059669]">schedule</span>
              <span>{scheduledVisitInfo.timeSlot}</span>
            </div>
          </div>

          {scheduledVisitInfo.notes && (
            <p className="text-[11px] text-[#047857] font-extrabold px-1">
              📝 توضیحات: {scheduledVisitInfo.notes}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#a7f3d0]/60">
            <button
              onClick={() => setIsVisitModalOpen(true)}
              className="text-[11.5px] font-black text-[#004532] bg-white border border-[#86efac] hover:bg-[#dcfce7] px-3 py-1 rounded-xl shadow-2xs flex items-center gap-1 transition-all"
            >
              <span className="material-symbols-outlined text-[14px]">edit</span>
              <span>ویرایش نوبت</span>
            </button>
            <button
              onClick={handleCancelVisit}
              className="text-[11.5px] font-black text-[#dc2626] hover:bg-[#fef2f2] px-3 py-1 rounded-xl border border-transparent hover:border-[#fecaca] transition-all"
            >
              لغو نوبت
            </button>
          </div>
        </div>
      )}

      {/* Chat Container */}
      <div className="bg-white border border-[#bec9c2]/40 rounded-2xl flex flex-col h-[380px] shadow-xs overflow-hidden">
        {/* Chat Header */}
        <div className="bg-[#f0f4f8] px-4 py-2.5 border-b border-[#e2e8f0] flex justify-between items-center text-[12px] font-bold text-[#3f4944]">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#059669] animate-pulse" />
            گفتگوی آنلاین با مسئول فروش
          </span>
          <span className="text-[10px] text-[#6f7973]">پاسخگویی سریع</span>
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-[#f6fafe]/50">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col max-w-[85%] ${
                msg.sender === 'user' ? 'self-start items-start' : 'self-end items-end'
              }`}
            >
              <div
                className={`p-3 rounded-2xl text-[12.5px] leading-relaxed shadow-xs whitespace-pre-line ${
                  msg.sender === 'user'
                    ? 'bg-[#004532] text-white rounded-tr-none font-bold'
                    : 'bg-white text-[#171c1f] border border-[#e2e8f0] rounded-tl-none font-medium'
                }`}
              >
                {msg.text}
              </div>
              <span className="text-[9px] text-[#6f7973] mt-1 px-1">{msg.time}</span>
            </div>
          ))}
        </div>

        {/* Quick Suggestion Chips */}
        <div className="p-2 bg-white border-t border-[#f1f5f9] flex gap-1.5 overflow-x-auto no-scrollbar">
          {[
            'تخفیف خرید نقدی',
            'پیگیری ارسال فاکتور',
            'شرایط چک صیادی',
          ].map((chip, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(chip)}
              className="bg-[#f0f4f8] hover:bg-[#004532]/10 text-[#004532] px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 transition-colors"
            >
              + {chip}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-white border-t border-[#e2e8f0] flex gap-2 items-center">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="پیام خود را به ویزیتور بنویسید..."
            className="flex-1 bg-[#f0f4f8] border border-[#bec9c2]/40 rounded-xl px-3 py-2 text-[13px] focus:ring-2 focus:ring-[#004532]/20 focus:border-[#004532]"
          />
          <button
            onClick={() => handleSend()}
            className="bg-[#004532] hover:bg-[#022c22] text-white p-2.5 rounded-xl active:scale-95 transition-all shadow-xs flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-[20px]">send</span>
          </button>
        </div>
      </div>

      {/* 1. VISITOR VISIT SCHEDULING MODAL ("فرم درخواست مراجعه حضوری ویزیتور") */}
      {isVisitModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full my-auto border border-[#e2e8f0] shadow-2xl text-right animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-[#e2e8f0] pb-3.5 mb-4">
              <div>
                <span className="text-[11px] font-black text-[#059669] bg-[#ecfdf5] border border-[#a7f3d0] px-2.5 py-0.5 rounded-full">
                  هماهنگی بازدید ویزیتور
                </span>
                <h2 className="text-[16.5px] font-black text-[#0f172a] mt-1">
                  درخواست مراجعه حضوری ویزیتور ({visitor.name})
                </h2>
                <p className="text-[11.5px] text-[#64748b] mt-0.5">
                  روز و ساعت پیشنهادی خود را جهت حضور ویزیتور در مغازه/داروخانه انتخاب نمایید.
                </p>
              </div>

              <button
                onClick={() => setIsVisitModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#f1f5f9] text-[#64748b] flex items-center justify-center hover:bg-[#e2e8f0] shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Step 1: Date Selection */}
            <div className="space-y-2 mb-4">
              <label className="text-[12.5px] font-black text-[#0f172a] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[17px] text-[#059669]">
                  calendar_month
                </span>
                <span>۱. انتخاب روز مراجعه</span>
              </label>

              <div className="grid grid-cols-2 gap-2">
                {visitDateOptions.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedVisitDate(item.label)}
                    className={`p-3 rounded-2xl border text-right transition-all flex flex-col gap-0.5 ${
                      selectedVisitDate === item.label
                        ? 'border-[#059669] bg-[#ecfdf5] text-[#004532] ring-2 ring-[#059669]/20 font-black shadow-2xs'
                        : 'border-[#e2e8f0] bg-[#f8fafc] text-[#334155] hover:border-[#cbd5e1] font-extrabold'
                    }`}
                  >
                    <span className="text-[12.5px]">{item.label}</span>
                    <span className="text-[10px] text-[#64748b]">{item.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Time Window Selection */}
            <div className="space-y-2 mb-4">
              <label className="text-[12.5px] font-black text-[#0f172a] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[17px] text-[#059669]">
                  schedule
                </span>
                <span>۲. انتخاب بازه زمانی حضور</span>
              </label>

              <div className="grid grid-cols-2 gap-2">
                {visitTimeOptions.map((slot) => (
                  <button
                    key={slot.id}
                    onClick={() => setSelectedVisitTime(`${slot.label} (${slot.title})`)}
                    className={`p-2.5 rounded-2xl border text-right transition-all flex items-center justify-between ${
                      selectedVisitTime.includes(slot.label)
                        ? 'border-[#059669] bg-[#ecfdf5] text-[#004532] ring-2 ring-[#059669]/20 font-black shadow-2xs'
                        : 'border-[#e2e8f0] bg-[#f8fafc] text-[#334155] hover:border-[#cbd5e1] font-extrabold'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-[10px] text-[#64748b]">{slot.title}</span>
                      <span className="text-[12px]">{slot.label}</span>
                    </div>
                    <span className="material-symbols-outlined text-[18px] text-[#059669]">
                      schedule
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3: Visit Purpose / Note */}
            <div className="space-y-1.5 mb-5">
              <label className="text-[12.5px] font-black text-[#0f172a] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[17px] text-[#059669]">
                  edit_note
                </span>
                <span>۳. موضوع یا توضیحات نوبت (اختیاری)</span>
              </label>
              <input
                type="text"
                value={visitNote}
                onChange={(e) => setVisitNote(e.target.value)}
                placeholder="مثال: بررسی سفارش پکیج جدید، استعلام چک، دریافت نمونه محصول..."
                className="w-full bg-[#f8fafc] border border-[#e2e8f0] rounded-2xl p-3 text-[12px] text-[#0f172a] focus:outline-hidden focus:border-[#059669]"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleConfirmVisitSchedule}
                className="flex-1 py-3.5 bg-[#004532] hover:bg-[#022c22] text-white font-black text-[13px] rounded-2xl shadow-xs transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                <span>ثبت نهایی درخواست مراجعه</span>
              </button>

              <button
                onClick={() => setIsVisitModalOpen(false)}
                className="px-4 py-3.5 bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#475569] font-black text-[12.5px] rounded-2xl border border-[#cbd5e1] transition-all"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. PRICE LIST & CATALOG MODAL ("استعلام لیست قیمت") */}
      {isPriceListModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full my-auto border border-[#e2e8f0] shadow-2xl text-right animate-in zoom-in-95 duration-200 space-y-4">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-[#e2e8f0] pb-3">
              <div>
                <span className="text-[11px] font-black text-[#0284c7] bg-[#f0f9ff] border border-[#bae6fd] px-2.5 py-0.5 rounded-full">
                  استعلام و دانلود قیمت‌ها
                </span>
                <h2 className="text-[16.5px] font-black text-[#0f172a] mt-1">
                  لیست قیمت رسمی و کاتالوگ سیلانه سبز
                </h2>
                <p className="text-[11.5px] text-[#64748b] mt-0.5">
                  آخرین تغییرات قیمت محصولات، تخفیف‌های حاشیه سود و فایل‌های PDF/Excel قابل دانلود
                </p>
              </div>

              <button
                onClick={() => setIsPriceListModalOpen(false)}
                className="w-8 h-8 rounded-full bg-[#f1f5f9] text-[#64748b] flex items-center justify-center hover:bg-[#e2e8f0] shrink-0"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Download Cards */}
            <div className="space-y-2.5">
              {/* Excel File */}
              <div className="p-3.5 rounded-2xl border border-[#cbd5e1] bg-[#f8fafc] flex items-center justify-between hover:border-[#0284c7] transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#ecfdf5] text-[#059669] flex items-center justify-center border border-[#a7f3d0] shrink-0 font-black text-[13px]">
                    XLS
                  </div>
                  <div>
                    <h4 className="text-[13px] font-black text-[#0f172a]">
                      لیست قیمت کامل (اکسل Excel)
                    </h4>
                    <span className="text-[11px] text-[#64748b] font-bold">
                      شامل بارکد، قیمت مصرف کننده و قیمت داروخانه
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleDownloadFile('لیست قیمت کامل اکسل')}
                  className="bg-[#004532] hover:bg-[#022c22] text-white px-3 py-1.5 rounded-xl text-[11.5px] font-black flex items-center gap-1 shadow-2xs active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[15px]">download</span>
                  <span>دانلود</span>
                </button>
              </div>

              {/* PDF Catalog */}
              <div className="p-3.5 rounded-2xl border border-[#cbd5e1] bg-[#f8fafc] flex items-center justify-between hover:border-[#0284c7] transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#fef2f2] text-[#dc2626] flex items-center justify-center border border-[#fecaca] shrink-0 font-black text-[13px]">
                    PDF
                  </div>
                  <div>
                    <h4 className="text-[13px] font-black text-[#0f172a]">
                      کاتالوگ تصویری محصولات (PDF)
                    </h4>
                    <span className="text-[11px] text-[#64748b] font-bold">
                      شرح کامل مشخصات برندها و طرح‌های تشویقی
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => handleDownloadFile('کاتالوگ تصویری PDF')}
                  className="bg-[#0284c7] hover:bg-[#0369a1] text-white px-3 py-1.5 rounded-xl text-[11.5px] font-black flex items-center gap-1 shadow-2xs active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[15px]">download</span>
                  <span>دانلود</span>
                </button>
              </div>
            </div>

            {/* Quick Request to Visitor */}
            <div className="bg-[#f0f9ff] border border-[#bae6fd] p-3 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#0284c7] text-[20px]">
                  mark_as_unread
                </span>
                <span className="text-[12px] font-black text-[#0369a1]">
                  ارسال کاتالوگ چاپی به همراه ویزیتور
                </span>
              </div>

              <button
                onClick={() => {
                  setIsPriceListModalOpen(false);
                  handleSend('لطفاً در نوبت بعدی ویزیتور، کاتالوگ چاپی و لیست قیمت جدید را همراه داشته باشید.');
                }}
                className="bg-white border border-[#7dd3fc] text-[#0284c7] px-3 py-1 rounded-xl text-[11px] font-black hover:bg-[#e0f2fe] transition-all"
              >
                درخواست
              </button>
            </div>

            {/* Footer Close */}
            <button
              onClick={() => setIsPriceListModalOpen(false)}
              className="w-full py-3 bg-[#f1f5f9] hover:bg-[#e2e8f0] text-[#334155] font-black text-[13px] rounded-2xl border border-[#cbd5e1] transition-all"
            >
              بستن
            </button>
          </div>
        </div>
      )}
    </div>
  );
};


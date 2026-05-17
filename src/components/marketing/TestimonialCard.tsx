type TestimonialCardProps = {
  business: string;
  role: string;
  location: string;
  name: string;
  text: string;
  color: string;
};

export function TestimonialCard({ business, role, location, name, text, color }: TestimonialCardProps) {
  return (
    <div
      className={`flex flex-col justify-between rounded-3xl border border-slate-800 ${color} p-6 text-slate-50 transition-all duration-300 hover:scale-[1.02] hover:border-slate-700 hover:shadow-xl hover:shadow-purple-500/20`}
    >
      <div>
        <div className="mb-2 text-sm tracking-wide text-amber-400">*****</div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-200/90">{business}</p>
        <p className="mt-3 text-sm leading-relaxed text-slate-100 sm:text-base">{text}</p>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-50/20 text-xs font-semibold text-slate-50 backdrop-blur-sm">
          {name.split(" ").map((n) => n[0]).join("")}
        </div>
        <div className="text-xs text-slate-200/90 sm:text-sm">
          <p className="font-semibold text-slate-50">{name}</p>
          <p>
            {role} Â· {location}
          </p>
        </div>
      </div>
    </div>
  );
}


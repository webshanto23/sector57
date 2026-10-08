export default function Home() {
  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground">
      <div className="mx-auto grid max-w-5xl gap-6">
        <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <p className="text-sm font-semibold text-primary">
            উত্তরা সেক্টর ৫৭ কল্যাণ সমিতি
          </p>
          <h1 className="mt-3 font-heading text-3xl font-bold">
            Community dashboard preview
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Minimal dummy screen to check the Sector 57 color tokens, Bengali
            font stack, cards, status colors, and spacing.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">
              Primary action
            </button>
            <button className="rounded-md border border-border bg-surface px-4 py-2 font-medium">
              Secondary
            </button>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {[
            ["Collected", "৳ ২১,৭০,০০০", "bg-good-soft text-good"],
            ["Pending", "৳ ৬,৮৪,৫০০", "bg-warn-soft text-warn"],
            ["Overdue", "৩১২ units", "bg-bad-soft text-bad"],
          ].map(([label, value, tone]) => (
            <div
              className="rounded-lg border border-border bg-card p-5 shadow-sm"
              key={label}
            >
              <p className="text-sm font-medium text-muted-foreground">
                {label}
              </p>
              <p className="mt-2 text-2xl font-bold">{value}</p>
              <span
                className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${tone}`}
              >
                Sample status
              </span>
            </div>
          ))}
        </section>

        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-heading text-xl font-semibold">
            নোটিশ বোর্ড
          </h2>
          <div className="mt-4 grid gap-3">
            <div className="rounded-md bg-accent p-4 text-accent-foreground">
              November service charge bills are ready.
            </div>
            <div className="rounded-md bg-surface-2 p-4 text-muted-foreground">
              Road 7 drain cleaning is scheduled for Sunday morning.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

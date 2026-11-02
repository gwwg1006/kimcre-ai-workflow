export default function PageHeader({ kicker, title, description, children }) {
  return (
    <section className="px-4 pt-12 pb-16 text-center md:pt-20 md:pb-24">
      <p className="text-xs text-muted-foreground">{kicker}</p>
      <h1 className="display mx-auto mt-4 max-w-6xl text-[16vw] md:text-[9vw] lg:text-[8rem]">{title}</h1>
      {description && <p className="mx-auto mt-8 max-w-xl text-muted-foreground md:text-lg">{description}</p>}
      {children}
    </section>
  );
}

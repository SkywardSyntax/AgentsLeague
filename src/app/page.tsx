export default function Home() {
  return (
    <main id="main-content" className="relative flex h-full w-full flex-col md:flex-row">
      {/* Whiteboard: full width stacked on mobile, 60% on desktop */}
      <section
        className="relative h-[50vh] w-full md:h-full md:w-[55%] lg:w-[60%]"
        aria-label="Whiteboard canvas"
      >
        {/* WhiteboardProvider and canvas stack will be mounted here */}
      </section>

      {/* Chat: full width stacked on mobile, 40% on desktop */}
      <section
        className="h-[50vh] w-full md:h-full md:w-[45%] lg:w-[40%]"
        aria-label="Chat panel"
      >
        {/* ChatPanel will be mounted here */}
      </section>
    </main>
  );
}

import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell min-h-screen lg:grid lg:grid-cols-[216px_minmax(0,1fr)]">
      <Sidebar />
      <div className="min-w-0 lg:h-screen lg:overflow-hidden">
        <TopBar />
        <main className="mx-auto max-w-[1728px] px-3 py-3 sm:px-4 lg:h-[calc(100vh-56px)] lg:overflow-y-auto lg:px-5 lg:py-4">{children}</main>
      </div>
    </div>
  );
}

import { GoClawSettings } from "./GoClawSettings";

export function GoClawSettingsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold text-white">Settings</h1>
      <div className="mt-6 border-b border-white/10 pb-3">
        <span className="border-b-2 border-white px-2 pb-3 text-sm font-medium text-white">
          GoClaw
        </span>
      </div>
      <div className="mt-6 max-w-2xl rounded-lg border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <GoClawSettings />
      </div>
    </main>
  );
}

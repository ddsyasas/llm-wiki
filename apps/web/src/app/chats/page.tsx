export default function ChatsIndexPage() {
  return (
    <main className="flex h-full items-center justify-center px-6 py-10">
      <div className="max-w-md text-center text-sm text-muted-foreground">
        <p className="text-lg font-medium text-foreground">No chat selected.</p>
        <p className="mt-2">
          Pick a chat from the sidebar, or click <strong>+ New chat</strong> to start one.
        </p>
      </div>
    </main>
  );
}

import { notFound } from "next/navigation";

import { getChat, listChatFolders, listPageRows, readChat } from "@llm-wiki/core";

import { ChatView } from "@/components/chats/chat-view";
import { openWikiContext } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

export default async function ChatDetailPage({ params }: { params: { id: string } }) {
  const ctx = await openWikiContext();
  try {
    if (!getChat(ctx.db, params.id)) notFound();
    const [chat, folders] = await Promise.all([
      readChat(ctx.wikiPath, params.id, ctx.db),
      listChatFolders(ctx.wikiPath),
    ]);
    const knownSlugs = listPageRows(ctx.db).map((r) => r.slug);
    return (
      <ChatView
        chatId={params.id}
        initialChat={chat}
        knownSlugs={knownSlugs}
        folders={folders}
      />
    );
  } finally {
    ctx.db.close();
  }
}

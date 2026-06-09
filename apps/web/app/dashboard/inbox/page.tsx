import { MessagesSquare } from "lucide-react";

export default function InboxIndex() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-slate-100">
        <MessagesSquare className="h-7 w-7 text-slate-400" />
      </div>
      <p className="mt-3 text-sm font-medium text-slate-600">
        Select a conversation
      </p>
      <p className="mt-1 max-w-xs text-xs text-slate-400">
        Pick a chat from the left to view the thread and reply. New conversations
        appear automatically when someone messages your number.
      </p>
    </div>
  );
}

"use client";

import type { ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import type { AgentStep, Message as ChatMessage } from "@/lib/api";
import { useT } from "@/lib/i18n/client";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { AnalysisResult } from "@/components/result";
import { AgentSteps } from "@/components/agent-steps";

function UserMessage({ children }: { children: string }) {
  const { t } = useT();
  return (
    <Message align="end" data-role="user" aria-label={t.workspace.you}>
      <MessageContent>
        <Bubble align="end" variant="muted">
          <BubbleContent className="user-message" dir="auto">
            {children}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}

/** shadcn Chat pattern; NDJSON events continue to come from our analytics API. */
export function ChatThread({
  messages,
  pendingQuestion,
  steps,
  busy,
  children,
}: {
  messages: ChatMessage[];
  pendingQuestion: string;
  steps: AgentStep[];
  busy: boolean;
  children: ReactNode;
}) {
  const { t } = useT();
  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="chat-scroller">
        <MessageScrollerViewport
          className="conversation"
          aria-label={t.workspace.chat}
        >
          <MessageScrollerContent className="chat-messages" aria-busy={busy}>
            {!messages.length && !pendingQuestion
              ? children
              : messages.map((message) => (
                  <MessageScrollerItem key={message.id} messageId={message.id}>
                    <div className="exchange">
                      <UserMessage>{message.question}</UserMessage>
                      <Message data-role="assistant">
                        <MessageContent>
                          <AnalysisResult result={message.result} />
                        </MessageContent>
                      </Message>
                    </div>
                  </MessageScrollerItem>
                ))}
            {pendingQuestion && (
              <MessageScrollerItem messageId="pending-turn">
                <div className="exchange">
                  <UserMessage>{pendingQuestion}</UserMessage>
                  <Message data-role="assistant">
                    <MessageContent>
                      <AgentSteps steps={steps} live={busy} />
                      {busy && (
                        <div role="status" className="working">
                          <LoaderCircle size={15} className="spin" />{" "}
                          {t.workspace.working}
                        </div>
                      )}
                    </MessageContent>
                  </Message>
                </div>
              </MessageScrollerItem>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton aria-label={t.workspace.scrollToLatest} />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

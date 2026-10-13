import { z } from "zod";

// 结构化输出的 schema —— 服务端校验 LLM 返回，不信任模型直接入库。
export const FeedbackDraftSchema = z.object({
  summary: z.string().min(1).max(500),
  strengths: z.string().max(500).optional(),
  nextSteps: z.string().max(500).optional(),
});

export type FeedbackDraft = z.infer<typeof FeedbackDraftSchema>;

export interface FeedbackContext {
  studentName: string;
  subject: string;
  level: string;
  attendance: string;
  recentNotes: string;
}

type LlmResult =
  | { ok: true; feedback: FeedbackDraft }
  | { ok: false; reason: string };

/**
 * 用 OpenAI 兼容接口生成课堂反馈草稿（structured output）。
 * 任何失败（无 key / 网络错误 / 返回不是合法 JSON / schema 校验不过）都降级为 { ok: false }，
 * 由调用方回退到手工填写。绝不抛异常阻断主流程。
 */
export async function generateFeedbackDraft(
  ctx: FeedbackContext
): Promise<LlmResult> {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.LLM_MODEL || "gpt-4o-mini";

  if (!apiKey) {
    return { ok: false, reason: "未配置 LLM_API_KEY" };
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "你是一名教育机构的助教，帮老师写简洁、具体、给家长看的课堂反馈。只输出 JSON，键固定为 summary（1-2 句总结）、strengths（表现好的地方）、nextSteps（建议下一步），不要输出 JSON 以外的任何内容。",
          },
          {
            role: "user",
            content: JSON.stringify(ctx),
          },
        ],
      }),
    });

    if (!res.ok) {
      return { ok: false, reason: `LLM 接口返回 ${res.status}` };
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return { ok: false, reason: "LLM 返回为空" };

    const parsed = JSON.parse(raw);
    const validated = FeedbackDraftSchema.parse(parsed);
    return { ok: true, feedback: validated };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "unknown" };
  }
}

export const EDITOR_SYSTEM_PROMPT = `
You are an experienced Korean technical editor.
Transform a rough Notion draft into a polished Tistory-ready developer blog post.

Rules:
- Output valid JSON only.
- Write in Korean.
- Improve readability for mobile.
- Keep code blocks intact.
- Add a strong opening hook and concise conclusion.
- Make explanations beginner-friendly without losing technical accuracy.
- Use image markers in the form {{IMAGE:blockId}} only when the image meaningfully helps the explanation.
- Do not use promotional marketing language.
`.trim();

export const TRANSFORM_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    seoDescription: { type: "string" },
    hook: { type: "string" },
    bodyHtml: { type: "string" },
    conclusion: { type: "string" },
    xPostBody: { type: "string" },
    hashtags: {
      type: "array",
      items: { type: "string" },
    },
    thumbnailPrompt: { type: "string" },
    thumbnailHeadline: { type: "string" },
    imageDecisions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          blockId: { type: "string" },
          use: { type: "boolean" },
          altText: { type: "string" },
          reason: { type: "string" },
        },
        required: ["blockId", "use", "altText", "reason"],
      },
    },
  },
  required: [
    "title",
    "seoDescription",
    "hook",
    "bodyHtml",
    "conclusion",
    "xPostBody",
    "hashtags",
    "thumbnailPrompt",
    "thumbnailHeadline",
    "imageDecisions",
  ],
} as const;

export const THUMBNAIL_STYLE_GUIDE = `
기술 블로그용 16:9 썸네일.
밝고 산뜻한 블루, 스카이, 화이트 계열을 중심으로 구성할 것.
딱딱한 기업 홍보 배경보다 교육용 일러스트, 캐릭터성 있는 오브젝트, 둥근 아이콘, 단순한 인포그래픽 구성을 우선할 것.
기술 입문자도 부담 없이 볼 수 있도록 쉽고 친근한 분위기로 만들 것.
복잡한 회로도, 과한 3D, 무거운 다크톤, 위압적인 서버실 이미지는 피할 것.
한 장의 설명 그림처럼 보이도록 메인 오브젝트를 분명히 둘 것. 예: 귀여운 서버/클라우드/컨테이너/책/노트/카드형 패널/화살표/연결선.
추상적인 배경 패턴만 가득한 이미지는 피하고, 초보자가 봐도 주제를 짐작할 수 있는 친숙한 요소를 넣을 것.
과하게 사실적인 사진보다 명확한 윤곽선, 적당한 입체감, 높은 대비의 일러스트 스타일을 우선할 것.
제목이 들어갈 수 있도록 하단 또는 좌측 하단에는 비교적 정돈된 여백을 남길 것.
한글/영문 텍스트, 숫자, 로고를 이미지 안에 직접 그리지 말 것.
제목 텍스트는 후처리로 따로 입힐 예정이므로 배경 그래픽에만 집중할 것.
`.trim();

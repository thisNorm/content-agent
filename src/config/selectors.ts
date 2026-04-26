export const TISTORY_SELECTORS = {
  titleInputs: [
    "#post-title-inp",
    "input[placeholder*='제목']",
    "textarea[placeholder*='제목']",
    "input.tt-input",
  ],
  editorRoots: [
    "#editor-tistory",
    "div[contenteditable='true']",
    ".ProseMirror",
    ".editor-body[contenteditable='true']",
    ".CodeMirror textarea",
  ],
  thumbnailInputs: [
    "input[type='file']",
    "input[name='attach-image']",
  ],
  modalThumbnailInputs: [
    ".ReactModalPortal .box_thumb input[type='file']",
    ".ReactModalPortal input[type='file']",
  ],
  tagInputs: [
    "#tagText",
    "input[placeholder*='태그']",
    "input[placeholder*='Tag']",
    "input[name='tag']",
    "input[id*='tag']",
  ],
  publishButtons: [
    "button:has-text('발행')",
    "button:has-text('완료')",
  ],
  confirmPublishButtons: [
    "button:has-text('공개 발행')",
    "button:has-text('발행')",
    "button:has-text('확인')",
  ],
  closeButtons: [
    "button:has-text('닫기')",
    "button:has-text('취소')",
    "button:has-text('다음에')",
  ],
} as const;
